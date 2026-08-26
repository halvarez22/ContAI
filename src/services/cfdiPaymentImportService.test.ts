import { describe, expect, it, vi } from 'vitest';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

import type { PagoExtracted } from '../lib/cfdiPagosParser';
import {
  deriveInvoicePaymentState,
  evaluateTipoPAutoApply,
  normalizeCfdiTipo,
  processTipoPPaymentImport,
  type PaymentImportStore,
  type ResolvedInvoiceTarget,
} from './cfdiPaymentImportService';
import {
  buildCfdiTransactionDraft,
  buildCfdiTransactionDraftExtended,
} from './cfdiBatchImportService';
import type { CfdiExtractedExtended } from '../lib/cfdiPagosParser';
import type { CfdiExtracted } from '../lib/cfdiXml';

function sampleCfdi(overrides: Partial<CfdiExtracted> = {}): CfdiExtracted {
  return {
    version: '4.0',
    fecha: '2026-01-15T12:00:00',
    tipoComprobante: 'I',
    subtotal: 1000,
    total: 1160,
    moneda: 'MXN',
    metodoPago: 'PUE',
    formaPago: '03',
    lugarExpedicion: '64000',
    emisorRfc: 'AAA010101AAA',
    emisorNombre: 'Emisor SA',
    emisorRegimen: '601',
    receptorRfc: 'BBB010101BBB',
    receptorNombre: 'Receptor SA',
    receptorUsoCfdi: 'G03',
    totalIvaTrasladado: 160,
    uuid: '12345678-1234-1234-1234-123456789012',
    descripcionPrimerConcepto: 'Servicio de prueba',
    ...overrides,
  };
}

function samplePagos(): PagoExtracted[] {
  return [
    {
      fechaPago: '2026-01-20T12:00:00',
      formaDePagoP: '03',
      monedaP: 'MXN',
      monto: 1000,
      documentos: [
        {
          idDocumento: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
          impSaldoAnt: 600,
          impPagado: 600,
          impSaldoInsoluto: 0,
          monedaDR: 'MXN',
        },
        {
          idDocumento: 'aaaaaaaa-bbbb-cccc-dddd-222222222222',
          impSaldoAnt: 500,
          impPagado: 400,
          impSaldoInsoluto: 100,
          monedaDR: 'MXN',
        },
      ],
    },
  ];
}

function defaultTargets(): Map<string, ResolvedInvoiceTarget> {
  return new Map<string, ResolvedInvoiceTarget>([
    [
      'aaaaaaaa-bbbb-cccc-dddd-111111111111',
      {
        transactionId: 'tx1',
        cfdiUuid: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
        fecha: '2026-01-10T12:00:00.000Z',
        montoOriginal: 600,
        saldoPendiente: 600,
        appliedPaymentAmount: 0,
      },
    ],
    [
      'aaaaaaaa-bbbb-cccc-dddd-222222222222',
      {
        transactionId: 'tx2',
        cfdiUuid: 'aaaaaaaa-bbbb-cccc-dddd-222222222222',
        fecha: '2026-01-11T12:00:00.000Z',
        montoOriginal: 500,
        saldoPendiente: 500,
        appliedPaymentAmount: 0,
      },
    ],
  ]);
}

function createMemoryStore(
  opts: { targets?: Map<string, ResolvedInvoiceTarget> } = {}
): PaymentImportStore {
  const targets = opts.targets ?? defaultTargets();
  return {
    resolveInvoicesByCfdiUuid: async (_org, uuids) => {
      const out = new Map<string, ResolvedInvoiceTarget>();
      for (const u of uuids) {
        const t = targets.get(u.toLowerCase()) ?? targets.get(u);
        if (t) out.set(u.toLowerCase(), t);
      }
      return out;
    },
  };
}

describe('deriveInvoicePaymentState', () => {
  it('PPD deja saldo_pendiente = monto', () => {
    const s = deriveInvoicePaymentState('PPD', 1160);
    expect(s.saldo_pendiente).toBe(1160);
    expect(s.payment_status).toBe('none');
    expect(s.applied_payment_amount).toBe(0);
  });

  it('PUE marca payment_status full', () => {
    const s = deriveInvoicePaymentState('PUE', 1160);
    expect(s.saldo_pendiente).toBe(0);
    expect(s.payment_status).toBe('full');
  });
});

describe('evaluateTipoPAutoApply', () => {
  it('auto-aplica cuando UUIDs resuelven y suma cuadra', () => {
    const resolved = new Map<string, ResolvedInvoiceTarget>([
      [
        'aaaaaaaa-bbbb-cccc-dddd-111111111111',
        {
          transactionId: 'tx1',
          cfdiUuid: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
          fecha: '2026-01-10T12:00:00.000Z',
          montoOriginal: 600,
          saldoPendiente: 600,
          appliedPaymentAmount: 0,
        },
      ],
      [
        'aaaaaaaa-bbbb-cccc-dddd-222222222222',
        {
          transactionId: 'tx2',
          cfdiUuid: 'aaaaaaaa-bbbb-cccc-dddd-222222222222',
          fecha: '2026-01-11T12:00:00.000Z',
          montoOriginal: 500,
          saldoPendiente: 500,
          appliedPaymentAmount: 0,
        },
      ],
    ]);
    const r = evaluateTipoPAutoApply({
      pagos: samplePagos(),
      resolved,
      periodosCerrados: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applications).toHaveLength(2);
    expect(r.sourceAmount).toBe(1000);
  });

  it('rechaza si falta UUID en org', () => {
    const r = evaluateTipoPAutoApply({
      pagos: samplePagos(),
      resolved: new Map(),
      periodosCerrados: [],
    });
    expect(r.ok).toBe(false);
  });

  it('rechaza auto-aplicación si factura destino está en periodo cerrado', () => {
    const pagos: PagoExtracted[] = [
      {
        fechaPago: '2026-01-20T12:00:00',
        formaDePagoP: '03',
        monedaP: 'MXN',
        monto: 100,
        documentos: [
          {
            idDocumento: 'UUID-123',
            impSaldoAnt: 100,
            impPagado: 100,
            impSaldoInsoluto: 0,
            monedaDR: 'MXN',
          },
        ],
      },
    ];
    const resolved = new Map<string, ResolvedInvoiceTarget>([
      [
        'uuid-123',
        {
          transactionId: 'tx1',
          cfdiUuid: 'UUID-123',
          fecha: '2025-12-15T12:00:00.000Z',
          montoOriginal: 100,
          saldoPendiente: 100,
          appliedPaymentAmount: 0,
        },
      ],
    ]);
    const result = evaluateTipoPAutoApply({
      pagos,
      resolved,
      periodosCerrados: ['2025-12'],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason.toLowerCase()).toContain('periodo cerrado');
    }
  });
});

describe('processTipoPPaymentImport idempotencia', () => {
  it('devuelve already_processed si confirmPayment lo reporta', async () => {
    const store = createMemoryStore();
    const confirmPayment = vi.fn(async () => ({ status: 'already_processed' as const }));
    const outcome = await processTipoPPaymentImport({
      organizationId: 'org1',
      userId: 'u1',
      paymentTxId: 'pay1',
      cfdiUuid: 'pago-uuid-1',
      pagos: samplePagos(),
      periodosCerrados: [],
      store,
      confirmPayment,
    });
    expect(outcome.status).toBe('already_processed');
    expect(confirmPayment).toHaveBeenCalledOnce();
  });

  it('delega confirmación canónica y retorna applied', async () => {
    const store = createMemoryStore();
    const confirmPayment = vi.fn(async () => ({
      status: 'confirmed' as const,
      applicationCount: 2,
      applicationIds: ['app1', 'app2'],
    }));
    const outcome = await processTipoPPaymentImport({
      organizationId: 'org1',
      userId: 'u1',
      paymentTxId: 'pay1',
      cfdiUuid: 'pago-uuid-1',
      pagos: samplePagos(),
      periodosCerrados: [],
      store,
      confirmPayment,
    });
    expect(outcome.status).toBe('applied');
    if (outcome.status !== 'applied') return;
    expect(outcome.applicationsCount).toBe(2);
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        userId: 'u1',
        sourceType: 'cfdi_pago',
        sourceId: 'pago-uuid-1',
        paymentTransactionId: 'pay1',
        applications: expect.arrayContaining([
          expect.objectContaining({ targetTransactionId: 'tx1', amount: 600 }),
          expect.objectContaining({ targetTransactionId: 'tx2', amount: 400 }),
        ]),
      })
    );
  });
});

describe('buildCfdiTransactionDraftExtended E9.2 F2', () => {
  it('I PUE mantiene regresión sin campos SAT disruptivos', () => {
    const r = buildCfdiTransactionDraft('u', 'org', 'a.xml', sampleCfdi());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.requiresGroqClassification).toBe(true);
    expect(r.draft.payload.monto).toBe(1160);
    expect(r.draft.payload.payment_status).toBe('full');
    expect(r.draft.payload.saldo_pendiente).toBe(0);
    expect(r.draft.payload.cfdi_tipo_comprobante).toBe('I');
  });

  it('PPD persiste saldo_pendiente = monto_original', () => {
    const ext: CfdiExtractedExtended = {
      ...sampleCfdi({ metodoPago: 'PPD' }),
      pagos: [],
    };
    const r = buildCfdiTransactionDraftExtended('u', 'org', 'ppd.xml', ext);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.payload.metodo_pago_sat).toBe('PPD');
    expect(r.draft.payload.saldo_pendiente).toBe(1160);
    expect(r.draft.payload.payment_status).toBe('none');
  });

  it('InformacionGlobal marca es_factura_global', () => {
    const ext: CfdiExtractedExtended = {
      ...sampleCfdi(),
      pagos: [],
      informacionGlobal: {
        periodicidad: '04',
        meses: '01',
        anio: '2026',
      },
    };
    const r = buildCfdiTransactionDraftExtended('u', 'org', 'global.xml', ext);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.payload.es_factura_global).toBe(true);
    expect(r.draft.payload.global_periodicidad).toBe('04');
  });

  it('tipo P omite Groq y guarda paymentPagos', () => {
    const ext: CfdiExtractedExtended = {
      ...sampleCfdi({
        tipoComprobante: 'P',
        total: 0,
        subtotal: 0,
        uuid: '11111111-2222-3333-4444-555555555555',
      }),
      pagos: samplePagos(),
    };
    const r = buildCfdiTransactionDraftExtended('u', 'org', 'p.xml', ext);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(normalizeCfdiTipo('P')).toBe('P');
    expect(r.draft.requiresGroqClassification).toBe(false);
    expect(r.draft.payload.cfdi_tipo_comprobante).toBe('P');
    expect(r.draft.payload.monto).toBe(1000);
    expect(r.draft.paymentPagos).toHaveLength(1);
  });
});
