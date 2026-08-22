import { describe, expect, it } from 'vitest';
import {
  countBankRowsByStatus,
  filterBankRowsByStatus,
  getBankRowViewStatus,
} from './bankReconciliationView';
import type { BankMatchSuggestion, ParsedBankRow } from '../types/bankReconciliation';

const row = (i: number): ParsedBankRow => ({
  fecha: `2026-01-0${i + 1}T00:00:00.000Z`,
  monto: 100 * (i + 1),
  descripcion: `row${i}`,
});

const hint = (
  partial: Partial<BankMatchSuggestion> & { bankRowIndex: number }
): BankMatchSuggestion => ({
  transactionId: null,
  score: 0,
  note: '',
  isConflict: false,
  suggestionSource: 'heuristic',
  ...partial,
});

describe('getBankRowViewStatus', () => {
  it('prioriza ai_error sobre match', () => {
    expect(
      getBankRowViewStatus(
        hint({ bankRowIndex: 0, transactionId: 'tx1' }),
        'Groq HTTP 429'
      )
    ).toBe('ai_error');
  });

  it('detecta conflict, ready y no_match', () => {
    expect(
      getBankRowViewStatus(
        hint({ bankRowIndex: 0, transactionId: 'tx1', isConflict: true }),
        undefined
      )
    ).toBe('conflict');
    expect(
      getBankRowViewStatus(
        hint({ bankRowIndex: 0, transactionId: 'tx1' }),
        undefined
      )
    ).toBe('ready');
    expect(getBankRowViewStatus(hint({ bankRowIndex: 0 }), undefined)).toBe(
      'no_match'
    );
  });
});

describe('filterBankRowsByStatus', () => {
  const rows = [row(0), row(1), row(2), row(3)];
  const hints = [
    hint({ bankRowIndex: 0, transactionId: 'a' }),
    hint({ bankRowIndex: 1, transactionId: 'b', isConflict: true }),
    hint({ bankRowIndex: 2 }),
    hint({ bankRowIndex: 3, transactionId: 'c' }),
  ];
  const errors = { 3: 'fail' };

  it('filtra all / ready / conflict / no_match / ai_error', () => {
    expect(filterBankRowsByStatus(rows, hints, errors, 'all')).toEqual([
      0, 1, 2, 3,
    ]);
    expect(filterBankRowsByStatus(rows, hints, errors, 'ready')).toEqual([0]);
    expect(filterBankRowsByStatus(rows, hints, errors, 'conflict')).toEqual([
      1,
    ]);
    expect(filterBankRowsByStatus(rows, hints, errors, 'no_match')).toEqual([
      2,
    ]);
    expect(filterBankRowsByStatus(rows, hints, errors, 'ai_error')).toEqual([
      3,
    ]);
  });
});

describe('countBankRowsByStatus', () => {
  it('cuenta por estado', () => {
    const rows = [row(0), row(1)];
    const hints = [
      hint({ bankRowIndex: 0, transactionId: 'a' }),
      hint({ bankRowIndex: 1 }),
    ];
    expect(countBankRowsByStatus(rows, hints, {})).toEqual({
      ready: 1,
      conflict: 0,
      no_match: 1,
      ai_error: 0,
    });
  });
});
