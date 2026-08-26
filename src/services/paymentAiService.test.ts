/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  suggestPaymentApplications,
  truncateAuditContext,
} from './paymentAiService';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

import { logAuditEntry } from './auditService';

describe('truncateAuditContext', () => {
  it('trunca a 500 caracteres', () => {
    const big = { x: 'a'.repeat(600) };
    expect(truncateAuditContext(big).length).toBe(500);
  });
});

describe('suggestPaymentApplications', () => {
  beforeEach(() => {
    vi.mocked(logAuditEntry).mockClear();
  });

  it('audita PROPOSED y retorna propuesta', async () => {
    const propose = vi.fn(async () => ({
      proposal: {
        applications: [{ targetTransactionId: 'tx1', amount: 100 }],
        confidence_score: 0.9,
        reason: 'match',
        requires_human_approval: false,
      },
      modelUsed: 'llama-test',
      tokensUsed: 42,
    }));

    const result = await suggestPaymentApplications({
      organizationId: 'org_main',
      sourceId: 'pago-uuid-1',
      context: {
        sourceAmount: 100,
        sourceType: 'cfdi_pago',
        candidates: [
          {
            transactionId: 'tx1',
            fecha: '2026-01-10T00:00:00.000Z',
            saldoPendiente: 100,
            concepto: 'Servicio',
          },
        ],
      },
      propose,
    });

    expect(result.status).toBe('proposed');
    expect(logAuditEntry).toHaveBeenCalledWith(
      'AI_PAYMENT_APPLICATION_PROPOSED',
      'ai_service',
      expect.objectContaining({
        organization_id: 'org_main',
        sourceId: 'pago-uuid-1',
      }),
      expect.objectContaining({
        provider: 'groq',
        modelUsed: 'llama-test',
        tokensUsed: 42,
      })
    );
  });

  it('audita FAILED y no lanza; mensaje usable en UI', async () => {
    const propose = vi.fn(async () => {
      throw new Error('Respuesta Groq no es JSON válido');
    });

    const result = await suggestPaymentApplications({
      organizationId: 'org_main',
      sourceId: 'pago-uuid-1',
      context: {
        sourceAmount: 100,
        sourceType: 'manual',
        candidates: [],
      },
      propose,
    });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.error).toMatch(/manual/i);
    expect(logAuditEntry).toHaveBeenCalledWith(
      'AI_PAYMENT_APPLICATION_FAILED',
      'ai_service',
      expect.objectContaining({ organization_id: 'org_main' }),
      expect.objectContaining({ provider: 'groq' })
    );
  });
});
