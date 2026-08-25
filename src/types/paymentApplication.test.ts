import { describe, expect, it } from 'vitest';
import {
  assertApplicationWithinSaldo,
  assertValidPaymentApplications,
  computeSaldoPendiente,
  derivePaymentStatus,
  moneyEq,
  sumPaymentAmounts,
} from './paymentApplication';

describe('paymentApplication money guards', () => {
  it('round-safe sum evita error 0.1+0.2', () => {
    const sum = sumPaymentAmounts([
      { targetTransactionId: 'a', amount: 0.1 },
      { targetTransactionId: 'b', amount: 0.2 },
    ]);
    expect(sum).toBe(0.3);
    expect(moneyEq(sum, 0.3)).toBe(true);
  });

  it('computeSaldoPendiente nunca es negativo', () => {
    expect(computeSaldoPendiente(100, 40)).toBe(60);
    expect(computeSaldoPendiente(100, 100.001)).toBe(0);
    expect(computeSaldoPendiente(0.3, 0.4)).toBe(0);
  });

  it('assertValidPaymentApplications valida suma y ±2%', () => {
    const ok = assertValidPaymentApplications({
      sourceAmount: 100,
      applications: [
        { targetTransactionId: 't1', amount: 40 },
        { targetTransactionId: 't2', amount: 60 },
      ],
    });
    expect(ok.ok).toBe(true);

    const bad = assertValidPaymentApplications({
      sourceAmount: 100,
      applications: [{ targetTransactionId: 't1', amount: 110 }],
    });
    expect(bad.ok).toBe(false);
  });

  it('overflow saldo y status partial/full', () => {
    expect(derivePaymentStatus(100, 0)).toBe('none');
    expect(derivePaymentStatus(100, 40)).toBe('partial');
    expect(derivePaymentStatus(100, 100)).toBe('full');

    const overflow = assertApplicationWithinSaldo({
      targetTransactionId: 'tx1',
      amount: 50,
      saldoPendiente: 40,
    });
    expect(overflow.ok).toBe(false);
  });
});
