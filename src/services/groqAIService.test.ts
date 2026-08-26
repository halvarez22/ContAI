import { describe, expect, it } from 'vitest';
import {
  parseAgentJson,
  parseBankAiMatchJson,
  parsePaymentApplicationsJson,
  paymentAiPayloadForGroq,
  resolvePaymentAiProposal,
  sanitizeBankDescription,
  sanitizeClassificationContext,
  sanitizePaymentApplicationContext,
} from './groqAIService';

describe('parseAgentJson', () => {
  it('acepta JSON válido de AgentDecision', () => {
    const raw = JSON.stringify({
      decision: 'clasificar_gasto_operativo',
      confidence_score: 0.91,
      reason: 'Renta de oficina',
      requires_human_approval: false,
      account_name: 'Gastos Operativos',
    });
    const d = parseAgentJson(raw);
    expect(d.decision).toBe('clasificar_gasto_operativo');
    expect(d.confidence_score).toBe(0.91);
    expect(d.account_name).toBe('Gastos Operativos');
  });

  it('acepta JSON dentro de fence markdown', () => {
    const raw =
      '```json\n{"decision":"x","confidence_score":0.5,"reason":"r","requires_human_approval":true}\n```';
    expect(parseAgentJson(raw).decision).toBe('x');
  });

  it('rechaza JSON incompleto', () => {
    expect(() => parseAgentJson('{"decision":"solo"}')).toThrow(/incompleta/i);
  });
});

describe('parseBankAiMatchJson', () => {
  it('acepta propuesta válida y clampa confidence', () => {
    const p = parseBankAiMatchJson(
      JSON.stringify({
        matchedTransactionId: 'tx1',
        confidence_score: 1.5,
        reason: 'ok',
        requires_human_approval: false,
      })
    );
    expect(p.matchedTransactionId).toBe('tx1');
    expect(p.confidence_score).toBe(1);
  });

  it('acepta matchedTransactionId null', () => {
    const p = parseBankAiMatchJson(
      JSON.stringify({
        matchedTransactionId: null,
        confidence_score: 0.2,
        reason: 'sin match',
        requires_human_approval: true,
      })
    );
    expect(p.matchedTransactionId).toBeNull();
  });

  it('rechaza JSON incompleto', () => {
    expect(() => parseBankAiMatchJson('{"matchedTransactionId":"x"}')).toThrow(
      /incompleta/i
    );
  });
});

describe('sanitizeClassificationContext', () => {
  it('enmascara email, teléfono y RFC en strings', () => {
    const cleaned = sanitizeClassificationContext({
      concepto: 'Pago a juan@empresa.com RFC XAXX010101000',
      proveedor: 'Acme',
      telefono: '5512345678',
      email: 'a@b.com',
      rfc_contraparte: 'ABCD901231XYZ',
    });
    expect(String(cleaned.concepto)).not.toContain('juan@empresa.com');
    expect(String(cleaned.concepto)).toContain('[email]');
    expect(String(cleaned.concepto)).not.toMatch(/XAXX010101000/i);
    expect(cleaned.email).toBe('[redacted]');
    expect(cleaned.telefono).toBe('[redacted]');
    expect(String(cleaned.rfc_contraparte)).toMatch(/\*\*\*/);
    expect(String(cleaned.rfc_contraparte)).not.toBe('ABCD901231XYZ');
  });
});

describe('sanitizeBankDescription', () => {
  it('enmascara refs largas y nombres capitalizados', () => {
    const s = sanitizeBankDescription(
      'TRANSFERENCIA 123456789012 Juan Perez CLABE 012345678901234567'
    );
    expect(s).not.toMatch(/123456789012/);
    expect(s).toContain('[ref]');
    expect(s).toContain('[nombre]');
  });
});

describe('sanitizePaymentApplicationContext / parsePaymentApplicationsJson', () => {
  it('usa aliases Factura_N y no incluye RFC/nombres en payload Groq', () => {
    const sanitized = sanitizePaymentApplicationContext({
      sourceAmount: 1000,
      sourceType: 'cfdi_pago',
      candidates: [
        {
          transactionId: 'tx-real-1',
          fecha: '2026-01-10T00:00:00.000Z',
          saldoPendiente: 600,
          concepto: 'Servicios Juan Perez RFC XAXX010101000',
        },
        {
          transactionId: 'tx-real-2',
          fecha: '2026-01-11T00:00:00.000Z',
          saldoPendiente: 400,
          concepto: 'Consultoria',
        },
      ],
    });
    expect(sanitized.candidates[0]?.alias).toBe('Factura_1');
    expect(sanitized.aliasToTransactionId.Factura_1).toBe('tx-real-1');
    const payload = JSON.stringify(paymentAiPayloadForGroq(sanitized));
    expect(payload).not.toContain('tx-real-1');
    expect(payload).not.toMatch(/XAXX010101000/i);
    expect(payload).not.toContain('Juan Perez');
    expect(payload).toContain('Factura_1');
  });

  it('parse + resolve descarta alias fantasma y marca requires_human_approval', () => {
    const parsed = parsePaymentApplicationsJson(
      JSON.stringify({
        applications: [
          { targetAlias: 'Factura_1', amount: 600 },
          { targetAlias: 'Factura_99', amount: 400 },
        ],
        confidence_score: 0.8,
        reason: 'ok',
        requires_human_approval: false,
      })
    );
    const proposal = resolvePaymentAiProposal(
      parsed,
      { Factura_1: 'tx1' },
      1000
    );
    expect(proposal.applications).toHaveLength(1);
    expect(proposal.applications[0]?.targetTransactionId).toBe('tx1');
    expect(proposal.requires_human_approval).toBe(true);
    expect(proposal.confidence_score).toBe(0.8);
  });
});
