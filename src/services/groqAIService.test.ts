import { describe, expect, it } from 'vitest';
import {
  parseAgentJson,
  parseBankAiMatchJson,
  sanitizeBankDescription,
  sanitizeClassificationContext,
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
