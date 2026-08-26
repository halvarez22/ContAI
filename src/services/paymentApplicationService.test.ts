/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildPaymentTargetUpdates,
  confirmPaymentApplications,
  validatePaymentApplicationsInput,
  type PaymentApplicationPersistence,
} from './paymentApplicationService';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

import { logAuditEntry } from './auditService';

const ORG = 'org_main';
const USER = 'user_1';

function sampleTargets() {
  return [
    {
      transactionId: 'tx1',
      organizationId: ORG,
      montoOriginal: 600,
      saldoPendiente: 600,
      appliedPaymentAmount: 0,
      fecha: '2026-01-10T12:00:00.000Z',
    },
    {
      transactionId: 'tx2',
      organizationId: ORG,
      montoOriginal: 500,
      saldoPendiente: 500,
      appliedPaymentAmount: 0,
      fecha: '2026-01-11T12:00:00.000Z',
    },
  ];
}

function createMockPersistence(
  overrides: Partial<PaymentApplicationPersistence> = {}
): PaymentApplicationPersistence & {
  writes: unknown[];
} {
  const writes: unknown[] = [];
  return {
    writes,
    hasApplicationsForSource: vi.fn(async () => false),
    writeApplicationsBatch: vi.fn(async (payload) => {
      writes.push(payload);
      return { applicationIds: ['app1', 'app2'] };
    }),
    ...overrides,
  };
}

describe('validatePaymentApplicationsInput', () => {
  it('rechaza organization_id inconsistente en target', () => {
    const r = validatePaymentApplicationsInput({
      organizationId: ORG,
      userId: USER,
      sourceType: 'cfdi_pago',
      sourceId: 'src-1',
      sourceAmount: 100,
      applications: [{ targetTransactionId: 'tx1', amount: 100 }],
      targets: [
        {
          transactionId: 'tx1',
          organizationId: 'other_org',
          montoOriginal: 100,
          saldoPendiente: 100,
          appliedPaymentAmount: 0,
          fecha: '2026-01-10T12:00:00.000Z',
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.status).toBe('validation_error');
    }
  });

  it('rechaza factura en periodo cerrado', () => {
    const r = validatePaymentApplicationsInput({
      organizationId: ORG,
      userId: USER,
      sourceType: 'cfdi_pago',
      sourceId: 'src-1',
      sourceAmount: 100,
      applications: [{ targetTransactionId: 'tx1', amount: 100 }],
      targets: [
        {
          transactionId: 'tx1',
          organizationId: ORG,
          montoOriginal: 100,
          saldoPendiente: 100,
          appliedPaymentAmount: 0,
          fecha: '2025-12-15T12:00:00.000Z',
        },
      ],
      periodosCerrados: ['2025-12'],
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.status).toBe('closed_period');
    }
  });
});

describe('buildPaymentTargetUpdates', () => {
  it('calcula saldo_pendiente y payment_status tras aplicar', () => {
    const updates = buildPaymentTargetUpdates(sampleTargets(), [
      { targetTransactionId: 'tx1', amount: 600 },
      { targetTransactionId: 'tx2', amount: 400 },
    ]);
    expect(updates).toHaveLength(2);
    const tx1 = updates.find((u) => u.transactionId === 'tx1');
    expect(tx1?.paymentStatus).toBe('full');
    expect(tx1?.saldoPendiente).toBe(0);
    const tx2 = updates.find((u) => u.transactionId === 'tx2');
    expect(tx2?.paymentStatus).toBe('partial');
    expect(tx2?.saldoPendiente).toBe(100);
  });
});

describe('confirmPaymentApplications', () => {
  beforeEach(() => {
    vi.mocked(logAuditEntry).mockClear();
  });

  it('retorna already_processed si source_id existe', async () => {
    const persistence = createMockPersistence({
      hasApplicationsForSource: vi.fn(async () => true),
    });
    const result = await confirmPaymentApplications(
      {
        organizationId: ORG,
        userId: USER,
        sourceType: 'cfdi_pago',
        sourceId: 'uuid-pago',
        sourceAmount: 1000,
        applications: [
          { targetTransactionId: 'tx1', amount: 600 },
          { targetTransactionId: 'tx2', amount: 400 },
        ],
        targets: sampleTargets(),
      },
      persistence
    );
    expect(result.status).toBe('already_processed');
    expect(persistence.writeApplicationsBatch).not.toHaveBeenCalled();
  });

  it('escribe batch atómico apps + TX patches', async () => {
    const persistence = createMockPersistence();
    const result = await confirmPaymentApplications(
      {
        organizationId: ORG,
        userId: USER,
        sourceType: 'cfdi_pago',
        sourceId: 'uuid-pago',
        sourceAmount: 1000,
        paymentTransactionId: 'pay-tx',
        applications: [
          { targetTransactionId: 'tx1', amount: 600 },
          { targetTransactionId: 'tx2', amount: 400 },
        ],
        targets: sampleTargets(),
        cfdiUuidByTargetId: { tx1: 'uuid-1', tx2: 'uuid-2' },
      },
      persistence
    );
    expect(result.status).toBe('confirmed');
    if (result.status !== 'confirmed') return;
    expect(result.applicationCount).toBe(2);
    expect(persistence.writes).toHaveLength(1);
    const payload = persistence.writes[0] as {
      organizationId: string;
      applications: unknown[];
      targetUpdates: unknown[];
    };
    expect(payload.organizationId).toBe(ORG);
    expect(payload.applications).toHaveLength(2);
    expect(payload.targetUpdates).toHaveLength(2);
  });

  it('registra PAYMENT_APPLICATION_CONFIRMED tras éxito', async () => {
    const persistence = createMockPersistence();
    await confirmPaymentApplications(
      {
        organizationId: ORG,
        userId: USER,
        sourceType: 'cfdi_pago',
        sourceId: 'uuid-pago',
        sourceAmount: 600,
        applications: [{ targetTransactionId: 'tx1', amount: 600 }],
        targets: [sampleTargets()[0]],
      },
      persistence
    );
    expect(logAuditEntry).toHaveBeenCalledWith(
      'PAYMENT_APPLICATION_CONFIRMED',
      'payment_applications',
      expect.objectContaining({ sourceId: 'uuid-pago', organization_id: ORG })
    );
  });

  it('rechaza Σ inválida sin escribir batch', async () => {
    const persistence = createMockPersistence();
    const result = await confirmPaymentApplications(
      {
        organizationId: ORG,
        userId: USER,
        sourceType: 'cfdi_pago',
        sourceId: 'uuid-pago',
        sourceAmount: 1000,
        applications: [{ targetTransactionId: 'tx1', amount: 500 }],
        targets: [sampleTargets()[0]],
      },
      persistence
    );
    expect(result.status).toBe('validation_error');
    expect(persistence.writeApplicationsBatch).not.toHaveBeenCalled();
  });

  it('rechaza overflow de saldo', async () => {
    const persistence = createMockPersistence();
    const result = await confirmPaymentApplications(
      {
        organizationId: ORG,
        userId: USER,
        sourceType: 'cfdi_pago',
        sourceId: 'uuid-pago',
        sourceAmount: 700,
        applications: [{ targetTransactionId: 'tx1', amount: 700 }],
        targets: [sampleTargets()[0]],
      },
      persistence
    );
    expect(result.status).toBe('validation_error');
    if (result.status !== 'validation_error') return;
    expect(result.error).toMatch(/Sobrepasa saldo/);
  });

  it('normaliza montos con roundMoney en batch payload', async () => {
    const persistence = createMockPersistence();
    await confirmPaymentApplications(
      {
        organizationId: ORG,
        userId: USER,
        sourceType: 'manual',
        sourceId: 'manual-1',
        sourceAmount: 0.3,
        applications: [
          { targetTransactionId: 'tx1', amount: 0.1 },
          { targetTransactionId: 'tx2', amount: 0.2 },
        ],
        targets: [
          {
            transactionId: 'tx1',
            organizationId: ORG,
            montoOriginal: 1,
            saldoPendiente: 1,
            appliedPaymentAmount: 0,
            fecha: '2026-01-10T12:00:00.000Z',
          },
          {
            transactionId: 'tx2',
            organizationId: ORG,
            montoOriginal: 1,
            saldoPendiente: 1,
            appliedPaymentAmount: 0,
            fecha: '2026-01-10T12:00:00.000Z',
          },
        ],
      },
      persistence
    );
    const payload = persistence.writes[0] as {
      applications: Array<{ amount: number }>;
    };
    expect(payload.applications[0].amount).toBe(0.1);
    expect(payload.applications[1].amount).toBe(0.2);
  });
});
