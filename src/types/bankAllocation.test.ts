import { describe, expect, it } from 'vitest';
import {
  assertValidAllocationsAgainstBank,
  deriveBankReconcileStatus,
  moneyEq,
  moneyWithinPct,
  sumAllocationAmounts,
  txRemainingAmount,
} from './bankAllocation';

describe('bankAllocation money guards', () => {
  it('round-safe sum evita error 0.1+0.2', () => {
    const sum = sumAllocationAmounts([
      { transactionId: 'a', amount: 0.1 },
      { transactionId: 'b', amount: 0.2 },
    ]);
    expect(sum).toBe(0.3);
    expect(moneyEq(sum, 0.3)).toBe(true);
  });

  it('assertValidAllocationsAgainstBank acepta suma exacta y ±2%', () => {
    const ok = assertValidAllocationsAgainstBank({
      bankAmount: 100,
      allocations: [
        { transactionId: 't1', amount: 40 },
        { transactionId: 't2', amount: 60 },
      ],
    });
    expect(ok.ok).toBe(true);

    const tol = assertValidAllocationsAgainstBank({
      bankAmount: 100,
      allocations: [{ transactionId: 't1', amount: 101.5 }],
    });
    expect(tol.ok).toBe(true);

    const bad = assertValidAllocationsAgainstBank({
      bankAmount: 100,
      allocations: [{ transactionId: 't1', amount: 110 }],
    });
    expect(bad.ok).toBe(false);
  });

  it('overflow remaining y status partial/full', () => {
    expect(txRemainingAmount(100, 40)).toBe(60);
    expect(deriveBankReconcileStatus(100, 0)).toBe('none');
    expect(deriveBankReconcileStatus(100, 40)).toBe('partial');
    expect(deriveBankReconcileStatus(100, 100)).toBe('full');
    expect(deriveBankReconcileStatus(100, 99)).toBe('full'); // ±2%
    expect(moneyWithinPct(98, 100)).toBe(true);
    expect(moneyWithinPct(97, 100)).toBe(false);
  });
});
