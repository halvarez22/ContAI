import { describe, expect, it } from 'vitest';
import {
  buildConfirmableMatches,
  buildBankReconcilePatch,
  parseBankCsv,
  suggestBankMatches,
  truncateBankMatchDesc,
  toBankLedgerItems,
} from './bankReconciliationService';
import { BANK_MATCH_DESC_MAX_LEN } from '../types/bankReconciliation';

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
