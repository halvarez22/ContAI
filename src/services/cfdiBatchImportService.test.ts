/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));
import {
  chunkArray,
  buildCfdiTransactionDraft,
  partitionDraftsByClosedPeriod,
  BATCH_CHUNK,
} from './cfdiBatchImportService';
import type { CfdiExtracted } from '../lib/cfdiXml';
import type { CfdiTransactionDraft } from '../types/cfdiBatch';

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
    claveProdServ: '01010101',
    ...overrides,
  };
}

describe('chunkArray', () => {
  it('parte en chunks del tamaño indicado', () => {
    const chunks = chunkArray([1, 2, 3, 4, 5], 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('usa BATCH_CHUNK por defecto vía size explícito 400', () => {
    expect(BATCH_CHUNK).toBe(400);
    const items = Array.from({ length: 401 }, (_, i) => i);
    const chunks = chunkArray(items, BATCH_CHUNK);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(400);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe('buildCfdiTransactionDraft', () => {
  it('arma draft pendiente con clasificación tipada', () => {
    const r = buildCfdiTransactionDraft('user1', 'org1', 'a.xml', sampleCfdi());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.payload.status).toBe('pendiente');
    expect(r.draft.payload.monto).toBe(1160);
    expect(r.draft.payload.importado_cfdi).toBe(true);
    expect(r.draft.classification.concepto).toContain('Servicio');
    expect(r.draft.fileName).toBe('a.xml');
    expect(r.draft.requiresGroqClassification).toBe(true);
  });
});

describe('buildNominaTransactionDraft (E13.1)', () => {
  it('1 egreso neto, cuenta fija, sin Groq, metadatos ISR/IMSS', async () => {
    const { buildNominaTransactionDraft } = await import('./cfdiBatchImportService');
    const { parseNominaXml } = await import('../lib/nominaXmlParser');
    const { buildNominaCfdi40Xml } = await import('./providers/nominaCfdiFixtures');
    const { DEFAULT_NOMINA_ACCOUNT_NAME } = await import('../config/nominaDefaults');

    const xml = buildNominaCfdi40Xml({
      uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      fecha: '2026-08-15T12:00:00',
      fechaPago: '2026-08-15',
      total: 8500,
      subtotal: 8500,
      totalPercepciones: 10000,
      totalDeducciones: 1500,
      isr: 1200,
      imss: 300,
      emisorRfc: 'EMP010101AAA',
      emisorNombre: 'Empresa',
      empleadoRfc: 'XAXX010101000',
      empleadoNombre: 'Ana Lopez',
    });
    const parsed = parseNominaXml(xml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = buildNominaTransactionDraft('u1', 'org1', 'nomina.xml', parsed.data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.requiresGroqClassification).toBe(false);
    expect(r.draft.payload.tipo).toBe('egreso');
    expect(r.draft.payload.monto).toBe(8500);
    expect(r.draft.payload.is_nomina).toBe(true);
    expect(r.draft.payload.account_name).toBe(DEFAULT_NOMINA_ACCOUNT_NAME);
    expect(r.draft.payload.account_code).toBe('601.01');
    expect(r.draft.payload.nomina_isr_retained).toBe(1200);
    expect(r.draft.payload.nomina_imss_retained).toBe(300);
    expect(r.draft.payload.rfc_contraparte).toBe('XAXX010101000');
    expect(r.draft.paymentPagos).toBeUndefined();
  });
});

describe('partitionDraftsByClosedPeriod', () => {
  it('omite drafts en periodos cerrados y acepta el resto', () => {
    const ok = buildCfdiTransactionDraft(
      'u',
      'org1',
      'ok.xml',
      sampleCfdi({ fecha: '2026-03-10T10:00:00' })
    );
    const closed = buildCfdiTransactionDraft(
      'u',
      'org1',
      'closed.xml',
      sampleCfdi({ fecha: '2026-01-05T10:00:00' })
    );
    expect(ok.ok && closed.ok).toBe(true);
    if (!ok.ok || !closed.ok) return;

    const drafts: CfdiTransactionDraft[] = [ok.draft, closed.draft];
    const { accepted, skipped } = partitionDraftsByClosedPeriod(drafts, ['2026-01']);

    expect(accepted.map((d) => d.fileName)).toEqual(['ok.xml']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].fileName).toBe('closed.xml');
    expect(skipped[0].ok).toBe(false);
    expect(skipped[0].error).toMatch(/cerrado/i);
  });

  it('copia la clave de producto al borrador', () => {
    const draft = buildCfdiTransactionDraft('u', 'org1', 'c.xml', sampleCfdi());
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.draft.payload.clave_prod_serv).toBe('01010101');
  });
});

describe('clasificación del batch', () => {
  it('una regla evita la llamada a Groq y un código inválido no se guarda', async () => {
    const { decideAccount } = await import('./accountMappingService');
    const { getChartOfAccountsSeed } = await import('../config/chartOfAccounts');
    const classify = vi.fn(async () => ({
      decision: 'x',
      confidence_score: 1,
      reason: 'inventado',
      requires_human_approval: false,
      account_code: '999.99',
      account_name: 'No existe',
    }));
    const chart = getChartOfAccountsSeed();
    const ruled = await decideAccount(
      { tipo: 'egreso', clave_prod_serv: '01010101', rfc_contraparte: 'XAXX010101000' },
      chart,
      [
        {
          id: 'r1',
          organization_id: 'org1',
          priority: 1,
          enabled: true,
          account_code: '601.84',
          match: { tipo: 'egreso', clave_prod_serv: '01010101' },
        },
      ],
      classify
    );
    expect(ruled.account_source).toBe('rule');
    expect(classify).not.toHaveBeenCalled();

    const invalid = await decideAccount(
      { tipo: 'egreso' },
      chart,
      [],
      classify
    );
    expect(invalid.account_code).toBe('601.84');
    expect(invalid.account_name).not.toBe('No existe');
  });

  it('la pasada del lote usa la regla y no llama a Groq', async () => {
    const { classifyBatchTransactions } = await import('./batchClassificationService');
    const { getChartOfAccountsSeed } = await import('../config/chartOfAccounts');
    const built = buildCfdiTransactionDraft('user1', 'org1', 'a.xml', sampleCfdi());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const classify = vi.fn(async () => undefined);
    const processed = await classifyBatchTransactions({
      accepted: [built.draft],
      documentIds: ['tx-1'],
      classify,
      accounts: getChartOfAccountsSeed(),
      rules: [
        {
          id: 'r1',
          organization_id: 'org1',
          priority: 1,
          enabled: true,
          account_code: '401.01',
          match: { tipo: 'ingreso', clave_prod_serv: '01010101' },
        },
      ],
      highAmountReviewThreshold: 50000,
      organizationId: 'org1',
      userId: 'user1',
      periodosCerrados: [],
      paymentImportStore: { resolveInvoicesByCfdiUuid: async () => new Map() },
    });
    expect(classify).not.toHaveBeenCalled();
    expect(processed.classified).toBe(1);
    expect(processed.patchUpdates[0]?.payload.account_code).toBe('401.01');
    expect(processed.results[0]?.ok).toBe(true);
  });
});
