import { describe, expect, it, vi } from 'vitest';
import {
  buildConfirmableMatches,
  buildBankReconcilePatch,
  enrichSuggestionsWithAi,
  parseBankCsv,
  selectAiEligibleRows,
  suggestBankMatches,
  truncateBankMatchDesc,
  toBankLedgerItems,
} from './bankReconciliationService';
import {
  BANK_AI_LOW_SCORE_THRESHOLD,
  BANK_MATCH_DESC_MAX_LEN,
} from '../types/bankReconciliation';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

describe('parseBankCsv', () => {
  it('parsea ISO y descripción con coma', () => {
    const csv = `fecha,monto,descripcion
2026-01-15,1500.50,Pago proveedor ACME
2026-01-16,200,Otro`;
    const { rows, errors } = parseBankCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].monto).toBe(1500.5);
    expect(rows[0].descripcion).toContain('ACME');
  });

  it('acepta punto y coma y montos con $', () => {
    const csv = `fecha;monto;desc
15/01/2026;$1,200.00;Transferencia`;
    const { rows, errors } = parseBankCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].monto).toBe(1200);
  });

  it('reporta archivo vacío', () => {
    const { rows, errors } = parseBankCsv('   ');
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/vacío/i);
  });
});

describe('suggestBankMatches', () => {
  const ledger = toBankLedgerItems([
    { id: 'tx1', monto: 1000, fecha: '2026-01-10T12:00:00.000Z', concepto: 'Renta' },
    { id: 'tx2', monto: 500, fecha: '2026-01-20T12:00:00.000Z', concepto: 'Luz' },
  ]);

  it('encuentra match por monto y fecha cercana', () => {
    const bank = [
      { fecha: '2026-01-11T00:00:00.000Z', monto: 1000, descripcion: 'RENTA ENE' },
    ];
    const hints = suggestBankMatches(bank, ledger);
    expect(hints[0].transactionId).toBe('tx1');
    expect(hints[0].isConflict).toBe(false);
    expect(hints[0].suggestionSource).toBe('heuristic');
    expect(hints[0].score).toBeGreaterThan(80);
  });

  it('sin match si monto fuera de tolerancia', () => {
    const bank = [
      { fecha: '2026-01-10T12:00:00.000Z', monto: 1500, descripcion: 'Otro' },
    ];
    const hints = suggestBankMatches(bank, ledger);
    expect(hints[0].transactionId).toBeNull();
    expect(hints[0].score).toBe(0);
  });

  it('marca isConflict si dos filas bancarias apuntan a la misma tx', () => {
    const bank = [
      { fecha: '2026-01-10T12:00:00.000Z', monto: 1000, descripcion: 'A' },
      { fecha: '2026-01-11T12:00:00.000Z', monto: 1000, descripcion: 'B' },
    ];
    const hints = suggestBankMatches(bank, ledger);
    expect(hints[0].transactionId).toBe('tx1');
    expect(hints[1].transactionId).toBe('tx1');
    expect(hints[0].isConflict).toBe(true);
    expect(hints[1].isConflict).toBe(true);
    expect(buildConfirmableMatches(bank, hints)).toHaveLength(0);
  });

  it('marca isConflict por ambigüedad 1.º vs 2.º candidato cercano', () => {
    const ambigLedger = toBankLedgerItems([
      { id: 'a', monto: 1000, fecha: '2026-01-10T12:00:00.000Z' },
      { id: 'b', monto: 1000, fecha: '2026-01-10T18:00:00.000Z' },
    ]);
    const bank = [
      { fecha: '2026-01-10T15:00:00.000Z', monto: 1000, descripcion: 'X' },
    ];
    const hints = suggestBankMatches(bank, ambigLedger);
    expect(hints[0].isConflict).toBe(true);
    expect(buildConfirmableMatches(bank, hints)).toHaveLength(0);
  });
});

describe('selectAiEligibleRows', () => {
  it('incluye sin match y score bajo; excluye fuerte y conflicto', () => {
    const hints = [
      {
        bankRowIndex: 0,
        transactionId: 'tx1',
        score: 95,
        note: 'ok',
        isConflict: false,
        suggestionSource: 'heuristic' as const,
      },
      {
        bankRowIndex: 1,
        transactionId: null,
        score: 0,
        note: 'sin',
        isConflict: false,
        suggestionSource: 'heuristic' as const,
      },
      {
        bankRowIndex: 2,
        transactionId: 'tx2',
        score: BANK_AI_LOW_SCORE_THRESHOLD - 1,
        note: 'bajo',
        isConflict: false,
        suggestionSource: 'heuristic' as const,
      },
      {
        bankRowIndex: 3,
        transactionId: 'tx3',
        score: 50,
        note: 'conf',
        isConflict: true,
        suggestionSource: 'heuristic' as const,
      },
    ];
    expect(selectAiEligibleRows(hints)).toEqual([1, 2]);
  });
});

describe('enrichSuggestionsWithAi', () => {
  const ledger = toBankLedgerItems([
    { id: 'tx1', monto: 1000, fecha: '2026-01-10T12:00:00.000Z', concepto: 'Renta' },
    { id: 'tx9', monto: 800, fecha: '2026-01-12T12:00:00.000Z', concepto: 'Otro' },
  ]);

  it('fusiona propuesta IA y marca source ai', async () => {
    const bank = [
      { fecha: '2026-01-10T12:00:00.000Z', monto: 1500, descripcion: 'SIN HEURISTICA' },
    ];
    const hints = suggestBankMatches(bank, ledger);
    expect(hints[0].transactionId).toBeNull();

    const summary = await enrichSuggestionsWithAi({
      bankRows: bank,
      ledger,
      suggestions: hints,
      propose: async () => ({
        proposal: {
          matchedTransactionId: 'tx9',
          confidence_score: 0.88,
          reason: 'Monto cercano y concepto similar',
          requires_human_approval: false,
        },
        modelUsed: 'test-model',
      }),
    });

    expect(summary.enriched).toBe(1);
    expect(summary.suggestions[0].transactionId).toBe('tx9');
    expect(summary.suggestions[0].suggestionSource).toBe('ai');
    expect(summary.suggestions[0].isConflict).toBe(false);
  });

  it('continúa si una fila falla (fallo parcial)', async () => {
    const bank = [
      { fecha: '2026-01-10T12:00:00.000Z', monto: 1500, descripcion: 'A' },
      { fecha: '2026-01-11T12:00:00.000Z', monto: 1600, descripcion: 'B' },
    ];
    const hints = suggestBankMatches(bank, ledger);
    let calls = 0;
    const summary = await enrichSuggestionsWithAi({
      bankRows: bank,
      ledger,
      suggestions: hints,
      propose: async () => {
        calls += 1;
        if (calls === 1) throw new Error('Groq HTTP 429');
        return {
          proposal: {
            matchedTransactionId: 'tx1',
            confidence_score: 0.7,
            reason: 'ok',
            requires_human_approval: false,
          },
          modelUsed: 'test-model',
        };
      },
    });
    expect(Object.keys(summary.errorByRowIndex).length).toBe(1);
    expect(summary.attempted).toBe(2);
    expect(summary.enriched).toBe(1);
  });

  it('marca conflicto post-IA si dos filas apuntan a la misma tx', async () => {
    const bank = [
      { fecha: '2026-01-10T12:00:00.000Z', monto: 1500, descripcion: 'A' },
      { fecha: '2026-01-11T12:00:00.000Z', monto: 1600, descripcion: 'B' },
    ];
    const hints = suggestBankMatches(bank, ledger);
    const summary = await enrichSuggestionsWithAi({
      bankRows: bank,
      ledger,
      suggestions: hints,
      propose: async () => ({
        proposal: {
          matchedTransactionId: 'tx1',
          confidence_score: 0.9,
          reason: 'mismo',
          requires_human_approval: false,
        },
        modelUsed: 'test-model',
      }),
    });
    expect(summary.suggestions[0].isConflict).toBe(true);
    expect(summary.suggestions[1].isConflict).toBe(true);
    expect(buildConfirmableMatches(bank, summary.suggestions)).toHaveLength(0);
  });
});

describe('buildBankReconcilePatch', () => {
  it('trunca descripción a 255 y clampa score', () => {
    const long = 'x'.repeat(400);
    const patch = buildBankReconcilePatch({
      bankRowIndex: 0,
      transactionId: 'tx1',
      score: 150,
      bankDescription: long,
    });
    expect(patch.payload.bank_reconciled).toBe(true);
    expect(patch.payload.bank_match_score).toBe(100);
    expect(patch.payload.bank_match_desc.length).toBe(BANK_MATCH_DESC_MAX_LEN);
  });
});

describe('truncateBankMatchDesc', () => {
  it('no altera textos cortos', () => {
    expect(truncateBankMatchDesc('hola')).toBe('hola');
  });
});
