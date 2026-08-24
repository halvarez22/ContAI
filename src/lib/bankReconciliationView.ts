/**
 * Vista pura de filas de conciliación (E5.3–E5.4) — sin React / sin I/O.
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
  aiError: string | undefined,
  sessionConfirmed = false
): BankRowViewStatus {
  if (sessionConfirmed) return 'ready';
  if (aiError) return 'ai_error';
  if (hint?.isConflict) return 'conflict';
  if (hint?.transactionId) return 'ready';
  return 'no_match';
}

export function filterBankRowsByStatus(
  rows: ParsedBankRow[],
  hints: BankMatchSuggestion[],
  errorByRowIndex: Record<number, string>,
  filter: BankRowFilter,
  sessionConfirmed?: ReadonlySet<number>
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const status = getBankRowViewStatus(
      hints[i],
      errorByRowIndex[i],
      sessionConfirmed?.has(i) ?? false
    );
    if (filter === 'all' || status === filter) {
      indices.push(i);
    }
  }
  return indices;
}

export function countBankRowsByStatus(
  rows: ParsedBankRow[],
  hints: BankMatchSuggestion[],
  errorByRowIndex: Record<number, string>,
  sessionConfirmed?: ReadonlySet<number>
): Record<BankRowViewStatus, number> {
  const counts: Record<BankRowViewStatus, number> = {
    ready: 0,
    conflict: 0,
    no_match: 0,
    ai_error: 0,
  };
  for (let i = 0; i < rows.length; i++) {
    counts[
      getBankRowViewStatus(
        hints[i],
        errorByRowIndex[i],
        sessionConfirmed?.has(i) ?? false
      )
    ] += 1;
  }
  return counts;
}

/** Filas resolubles manualmente (E5.4 §8.5A). */
export function isManuallyResolvableStatus(
  status: BankRowViewStatus,
  sessionConfirmed = false
): boolean {
  if (sessionConfirmed) return false;
  return (
    status === 'conflict' || status === 'no_match' || status === 'ai_error'
  );
}
