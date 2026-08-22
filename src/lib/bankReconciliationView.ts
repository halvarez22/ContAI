/**
 * Vista pura de filas de conciliación (E5.3) — sin React / sin I/O.
 */

import type {
  BankMatchSuggestion,
  ParsedBankRow,
} from '../types/bankReconciliation';

export type BankRowViewStatus =
  | 'ready'
  | 'conflict'
  | 'no_match'
  | 'ai_error';

export type BankRowFilter =
  | 'all'
  | 'ready'
  | 'conflict'
  | 'no_match'
  | 'ai_error';

export function getBankRowViewStatus(
  hint: BankMatchSuggestion | undefined,
  aiError: string | undefined
): BankRowViewStatus {
  if (aiError) return 'ai_error';
  if (hint?.isConflict) return 'conflict';
  if (hint?.transactionId) return 'ready';
  return 'no_match';
}

export function filterBankRowsByStatus(
  rows: ParsedBankRow[],
  hints: BankMatchSuggestion[],
  errorByRowIndex: Record<number, string>,
  filter: BankRowFilter
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const status = getBankRowViewStatus(hints[i], errorByRowIndex[i]);
    if (filter === 'all' || status === filter) {
      indices.push(i);
    }
  }
  return indices;
}

export function countBankRowsByStatus(
  rows: ParsedBankRow[],
  hints: BankMatchSuggestion[],
  errorByRowIndex: Record<number, string>
): Record<BankRowViewStatus, number> {
  const counts: Record<BankRowViewStatus, number> = {
    ready: 0,
    conflict: 0,
    no_match: 0,
    ai_error: 0,
  };
  for (let i = 0; i < rows.length; i++) {
    counts[getBankRowViewStatus(hints[i], errorByRowIndex[i])] += 1;
  }
  return counts;
}
