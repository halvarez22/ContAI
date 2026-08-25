/**
 * Allocations bancarias E9.1 — contratos e invariantes (montos a 2 decimales).
 */

import {
  BANK_MATCH_AMOUNT_TOLERANCE_PCT,
  type ParsedBankRow,
} from './bankReconciliation';

/** Misma semántica que taxCalculatorService.roundMoney — local para no acoplar types→services. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export const BANK_SPLIT_MAX_LEGS = 8;

export type BankReconcileStatus = 'none' | 'partial' | 'full';

export type BankAllocationDraft = {
  transactionId: string;
  amount: number;
};

export type BankMovementStatus = 'open' | 'allocated' | 'closed';

/** Compara montos ya redondeados a 2 decimales. */
export function moneyEq(a: number, b: number, eps = 0.005): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= eps;
}

export function moneyWithinPct(
  actual: number,
  expected: number,
  pct: number = BANK_MATCH_AMOUNT_TOLERANCE_PCT
): boolean {
  const e = roundMoney(expected);
  const a = roundMoney(actual);
  if (e === 0) return a === 0;
  const diffPct = (Math.abs(a - e) / Math.abs(e)) * 100;
  return diffPct <= pct;
}

export function sumAllocationAmounts(
  allocations: ReadonlyArray<BankAllocationDraft>
): number {
  let sum = 0;
  for (const a of allocations) {
    sum = roundMoney(sum + roundMoney(a.amount));
  }
  return sum;
}

export function txRemainingAmount(
  monto: number,
  alreadyReconciledAmount: number
): number {
  return roundMoney(
    Math.max(0, roundMoney(monto) - roundMoney(alreadyReconciledAmount))
  );
}

export function deriveBankReconcileStatus(
  monto: number,
  reconciledAmount: number
): BankReconcileStatus {
  const m = roundMoney(monto);
  const r = roundMoney(reconciledAmount);
  if (r <= 0) return 'none';
  if (moneyWithinPct(r, m) || r >= m) return 'full';
  return 'partial';
}

export function assertValidAllocationsAgainstBank(params: {
  bankAmount: number;
  allocations: ReadonlyArray<BankAllocationDraft>;
  tolerancePct?: number;
}): { ok: true; sum: number } | { ok: false; error: string } {
  const allocations = params.allocations.map((a) => ({
    transactionId: a.transactionId,
    amount: roundMoney(a.amount),
  }));
  if (allocations.length === 0) {
    return { ok: false, error: 'Sin allocations' };
  }
  for (const a of allocations) {
    if (!(a.amount > 0)) {
      return { ok: false, error: `Monto inválido en TX ${a.transactionId}` };
    }
  }
  const ids = new Set<string>();
  for (const a of allocations) {
    if (ids.has(a.transactionId)) {
      return { ok: false, error: `TX duplicada en split: ${a.transactionId}` };
    }
    ids.add(a.transactionId);
  }
  const sum = sumAllocationAmounts(allocations);
  const bank = roundMoney(params.bankAmount);
  if (!moneyWithinPct(sum, bank, params.tolerancePct)) {
    return {
      ok: false,
      error: `Σ allocations ${sum} ≠ monto banco ${bank} (±${params.tolerancePct ?? BANK_MATCH_AMOUNT_TOLERANCE_PCT}%)`,
    };
  }
  return { ok: true, sum };
}

export function bankMovementFingerprint(row: ParsedBankRow): string {
  const key = [
    String(row.fecha).slice(0, 10),
    roundMoney(row.monto).toFixed(2),
    row.descripcion.trim().toLowerCase(),
  ].join('|');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `bm_${(h >>> 0).toString(16)}_${key.length}`;
}
