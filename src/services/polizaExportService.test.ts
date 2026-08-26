import { describe, it, expect } from 'vitest';
import {
  buildPolizaDiarioTxt,
  buildPolizaLinesForTx,
  computePolizaTotals,
  countPolizaEligible,
  formatPolizaAmount,
  isPolizaEligible,
  sanitizePolizaField,
} from './polizaExportService';
import type { PolizaTxInput } from '../types/polizaExport';

const base = (over: Partial<PolizaTxInput> & { id: string }): PolizaTxInput => ({
  fecha: '2026-08-15T12:00:00.000Z',
  tipo: 'egreso',
  monto: 1500,
  concepto: 'Servicio',
  proveedor: 'Acme',
  account_name: 'Gastos Operativos',
  bank_reconciled: true,
  ...over,
});

describe('sanitizePolizaField / formatPolizaAmount', () => {
  it('elimina ; saltos y trunca a maxLen', () => {
    const s = sanitizePolizaField('Hola; mundo\ncon émoji 😀 y más texto', 20);
    expect(s.includes(';')).toBe(false);
    expect(s.includes('\n')).toBe(false);
    expect(s.length).toBeLessThanOrEqual(20);
  });

  it('montos siempre con 2 decimales y punto', () => {
    expect(formatPolizaAmount(1500)).toBe('1500.00');
    expect(formatPolizaAmount(1500.1)).toBe('1500.10');
    expect(formatPolizaAmount(1500.999)).toBe('1501.00');
  });
});

describe('isPolizaEligible / countPolizaEligible', () => {
  it('exige cuenta y conciliacion bancaria', () => {
    expect(isPolizaEligible(base({ id: '1' }))).toBe(true);
    expect(
      isPolizaEligible(base({ id: '2', account_name: '  ', bank_reconciled: true }))
    ).toBe(false);
    expect(
      isPolizaEligible(
        base({ id: '3', bank_reconciled: false, bank_reconcile_status: 'partial' })
      )
    ).toBe(false);
    expect(
      isPolizaEligible(
        base({
          id: '4',
          bank_reconciled: false,
          bank_reconcile_status: 'full',
        })
      )
    ).toBe(true);
  });

  it('count ignora tipo/monto invalidos', () => {
    const txs = [
      base({ id: 'ok' }),
      base({ id: 'bad-tipo', tipo: 'otro' }),
      base({ id: 'bad-monto', monto: 0 }),
      base({ id: 'skip', bank_reconciled: false }),
    ];
    expect(countPolizaEligible(txs)).toBe(1);
  });
});

describe('buildPolizaLinesForTx', () => {
  it('egreso: cargo cuenta / abono Bancos', () => {
    const lines = buildPolizaLinesForTx(base({ id: 'e1', monto: 100 }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      tipo: 'CARGO',
      cuenta: 'Gastos Operativos',
      cargo: 100,
      abono: 0,
    });
    expect(lines[1]).toMatchObject({
      tipo: 'ABONO',
      cuenta: 'Bancos',
      cargo: 0,
      abono: 100,
    });
  });

  it('ingreso: cargo Bancos / abono cuenta', () => {
    const lines = buildPolizaLinesForTx(
      base({ id: 'i1', tipo: 'ingreso', account_name: 'Ventas', monto: 50 })
    );
    expect(lines[0]?.cuenta).toBe('Bancos');
    expect(lines[0]?.cargo).toBe(50);
    expect(lines[1]?.cuenta).toBe('Ventas');
    expect(lines[1]?.abono).toBe(50);
  });
});

describe('buildPolizaDiarioTxt', () => {
  it('genera TXT balanceado con delimitador ; y 2 decimales', () => {
    const result = buildPolizaDiarioTxt({
      transactions: [
        base({ id: 'a', monto: 100 }),
        base({
          id: 'b',
          tipo: 'ingreso',
          account_name: 'Ventas',
          monto: 40,
          bank_reconcile_status: 'full',
          bank_reconciled: false,
        }),
        base({ id: 'skip', bank_reconciled: false, account_name: 'X' }),
      ],
      organizationId: 'org_main',
      periodKey: '2026-08',
      generatedAt: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eligibleCount).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.totalCargos).toBe(140);
    expect(result.totalAbonos).toBe(140);
    expect(result.text.includes('\r\n')).toBe(true);
    expect(result.text.startsWith('# ContAI Poliza Diario')).toBe(true);
    expect(result.text.includes('100.00')).toBe(true);
    expect(result.text.includes('40.00')).toBe(true);
    // sin BOM
    expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
    expect(result.fileName).toBe('poliza_ContAI_2026-08.txt');
  });

  it('0 elegibles → ok false con mensaje usable', () => {
    const result = buildPolizaDiarioTxt({
      transactions: [base({ id: 'x', bank_reconciled: false })],
      organizationId: 'org_main',
      periodKey: '2026-08',
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/conciliadas y clasificadas/i);
    }
  });

  it('asercion de balance: desequilibrio detectado', () => {
    const unbalanced = computePolizaTotals([
      {
        fecha: '2026-01-01',
        tipo: 'CARGO',
        cuenta: 'Gastos',
        concepto: 'X',
        cargo: 100,
        abono: 0,
        txId: '1',
      },
      {
        fecha: '2026-01-01',
        tipo: 'ABONO',
        cuenta: 'Bancos',
        concepto: 'X',
        cargo: 0,
        abono: 99,
        txId: '1',
      },
    ]);
    expect(unbalanced.balanced).toBe(false);

    const balanced = buildPolizaDiarioTxt({
      transactions: [base({ id: '1', monto: 10.005 })],
      organizationId: 'o',
      periodKey: '2026-01',
    });
    expect(balanced.ok).toBe(true);
    if (!balanced.ok) return;
    expect(balanced.totalCargos).toBe(balanced.totalAbonos);
  });
});
