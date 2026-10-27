import { describe, expect, it } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import { UTILIDAD_EJERCICIO_LABEL } from '../types/financialReports';
import { buildFinancialReports } from './financialReportsService';
import type { JournalLine } from '../types/journalEntry';

const chart = getChartOfAccountsSeed();

function line(
  account_code: string,
  account_name: string,
  tipo: 'cargo' | 'abono',
  monto: number
): JournalLine {
  return { account_code, account_name, tipo, monto, concepto: 'prueba' };
}

function tx(
  id: string,
  fecha: string,
  lines: JournalLine[] | null
): { id: string; fecha: string; asiento_devengo?: unknown } {
  return {
    id,
    fecha,
    ...(lines ? { asiento_devengo: { lines } } : {}),
  };
}

describe('buildFinancialReports', () => {
  it('deja totales en cero cuando no hay movimientos', () => {
    const report = buildFinancialReports({
      transactions: [],
      chart,
      year: 2026,
      monthIndex: 0,
      truncated: false,
    });
    expect(report.trialBalance.total_cargos).toBe(0);
    expect(report.trialBalance.total_abonos).toBe(0);
    expect(report.trialBalance.is_balanced).toBe(true);
    expect(report.trialBalance.rows).toEqual([]);
    expect(report.incomeStatement.utilidad_neta).toBe(0);
    expect(report.balanceSheet.total_activo).toBe(0);
    expect(report.balanceSheet.total_pasivo).toBe(0);
    expect(report.balanceSheet.total_capital).toBe(0);
    expect(report.balanceSheet.is_balanced).toBe(true);
    expect(report.balanceSheet.rows).toEqual([]);
  });

  it('cuadra el mes y manda el ingreso al estado de resultados sin el IVA', () => {
    const report = buildFinancialReports({
      transactions: [
        tx('t1', '2026-01-15T12:00:00.000Z', [
          line('105.01', 'Clientes', 'cargo', 1160),
          line('401.01', 'Ventas', 'abono', 1000),
          line('209.01', 'IVA', 'abono', 160),
        ]),
      ],
      chart,
      year: 2026,
      monthIndex: 0,
      truncated: false,
    });
    expect(report.trialBalance.is_balanced).toBe(true);
    expect(report.trialBalance.total_cargos).toBe(1160);
    expect(report.trialBalance.total_abonos).toBe(1160);
    const ventas = report.incomeStatement.rows.find((row) => row.account_code === '401.01');
    expect(ventas?.abonos).toBe(1000);
    expect(report.incomeStatement.rows.some((row) => row.account_code === '209.01')).toBe(false);
    expect(report.incomeStatement.rows.some((row) => row.account_code === '119.01')).toBe(false);
    expect(report.incomeStatement.total_ingresos).toBe(1000);
    expect(report.incomeStatement.utilidad_neta).toBe(1000);
  });

  it('arrastra el saldo inicial y el estado de resultados solo ve el mes', () => {
    const report = buildFinancialReports({
      transactions: [
        tx('ene', '2026-01-15T12:00:00.000Z', [
          line('105.01', 'Clientes', 'cargo', 1160),
          line('401.01', 'Ventas', 'abono', 1000),
          line('209.01', 'IVA', 'abono', 160),
        ]),
        tx('feb', '2026-02-10T12:00:00.000Z', [
          line('601.84', 'Gastos', 'cargo', 1000),
          line('119.01', 'IVA', 'cargo', 80),
          line('201.01', 'Proveedores', 'abono', 1080),
        ]),
      ],
      chart,
      year: 2026,
      monthIndex: 1,
      truncated: false,
    });
    const clientes = report.trialBalance.rows.find((row) => row.account_code === '105.01');
    expect(clientes?.saldo_inicial).toBe(1160);
    expect(clientes?.cargos).toBe(0);
    expect(clientes?.saldo_final).toBe(1160);
    const gasto = report.incomeStatement.rows.find((row) => row.account_code === '601.84');
    expect(gasto?.cargos).toBe(1000);
    expect(report.incomeStatement.rows.some((row) => row.account_code === '401.01')).toBe(false);
    expect(report.incomeStatement.total_gastos).toBe(1000);
    expect(report.incomeStatement.total_ingresos).toBe(0);
    expect(report.incomeStatement.utilidad_neta).toBe(-1000);
    expect(report.trialBalance.is_balanced).toBe(true);
  });

  it('conserva en los totales la cuenta no catalogada y la deja fuera del resultado', () => {
    const report = buildFinancialReports({
      transactions: [
        tx('x', '2026-03-01T12:00:00.000Z', [
          line('999.01', 'Ajena', 'cargo', 50),
          line('401.01', 'Ventas', 'abono', 50),
        ]),
      ],
      chart,
      year: 2026,
      monthIndex: 2,
      truncated: false,
    });
    expect(report.trialBalance.rows.some((row) => row.account_code === '999.01')).toBe(false);
    expect(report.trialBalance.anomalies[0]?.account_code).toBe('999.01');
    expect(report.trialBalance.total_cargos).toBe(50);
    expect(report.trialBalance.total_abonos).toBe(50);
    expect(report.trialBalance.is_balanced).toBe(true);
    expect(report.incomeStatement.total_ingresos).toBe(50);
    expect(report.incomeStatement.rows.some((row) => row.account_code === '999.01')).toBe(false);
  });

  it('marca descuadre cuando los cargos del mes no igualan los abonos', () => {
    const report = buildFinancialReports({
      transactions: [
        tx('bad', '2026-04-01T12:00:00.000Z', [
          line('601.84', 'Gastos', 'cargo', 100),
          line('201.01', 'Proveedores', 'abono', 90),
        ]),
      ],
      chart,
      year: 2026,
      monthIndex: 3,
      truncated: false,
    });
    expect(report.trialBalance.is_balanced).toBe(false);
    expect(report.trialBalance.rows.length).toBeGreaterThan(0);
  });

  it('omite filas en cero y conserva la anomalía de monto cero', () => {
    const report = buildFinancialReports({
      transactions: [
        tx('z', '2026-05-01T12:00:00.000Z', [
          line('102.01', 'Bancos', 'cargo', 0),
          line('102.01', 'Bancos', 'abono', 0),
          line('888.01', 'Sin catalogo', 'cargo', 0),
        ]),
      ],
      chart,
      year: 2026,
      monthIndex: 4,
      truncated: true,
    });
    expect(report.trialBalance.rows.some((row) => row.account_code === '102.01')).toBe(false);
    expect(report.trialBalance.anomalies.some((item) => item.account_code === '888.01')).toBe(true);
    expect(report.trialBalance.truncated).toBe(true);
  });

  it('cuenta movimientos del mes sin devengo y no los suma', () => {
    const report = buildFinancialReports({
      transactions: [tx('plain', '2026-06-02T12:00:00.000Z', null)],
      chart,
      year: 2026,
      monthIndex: 5,
      truncated: false,
    });
    expect(report.trialBalance.sin_devengo).toBe(1);
    expect(report.trialBalance.total_cargos).toBe(0);
    expect(report.trialBalance.is_balanced).toBe(true);
  });

  it('suma el IVA acreditable al activo, el trasladado al pasivo y la utilidad al capital', () => {
    const report = buildFinancialReports({
      transactions: [
        tx('ing', '2026-01-15T12:00:00.000Z', [
          line('105.01', 'Clientes', 'cargo', 1160),
          line('401.01', 'Ventas', 'abono', 1000),
          line('209.01', 'IVA', 'abono', 160),
        ]),
        tx('egr', '2026-01-20T12:00:00.000Z', [
          line('601.84', 'Gastos', 'cargo', 500),
          line('119.01', 'IVA', 'cargo', 80),
          line('201.01', 'Proveedores', 'abono', 580),
        ]),
      ],
      chart,
      year: 2026,
      monthIndex: 0,
      truncated: false,
    });
    const sheet = report.balanceSheet;
    const clientes = sheet.rows.find((row) => row.account_code === '105.01');
    const clientesBalanza = report.trialBalance.rows.find((row) => row.account_code === '105.01');
    expect(clientes?.saldo_final).toBe(clientesBalanza?.saldo_final);
    expect(sheet.rows.some((row) => row.account_code === '119.01')).toBe(true);
    expect(sheet.rows.some((row) => row.account_code === '209.01')).toBe(true);
    expect(sheet.rows.some((row) => row.account_code === '401.01')).toBe(false);
    expect(sheet.rows.some((row) => row.account_code === '601.84')).toBe(false);
    expect(sheet.rows.some((row) => row.account_name === UTILIDAD_EJERCICIO_LABEL)).toBe(true);
    expect(report.incomeStatement.utilidad_neta).toBe(500);
    expect(sheet.total_activo).toBe(1240);
    expect(sheet.total_pasivo).toBe(740);
    expect(sheet.total_capital).toBe(500);
    expect(sheet.is_balanced).toBe(true);
  });

  it('deja el balance descuadrado cuando el importe no tiene naturaleza', () => {
    const report = buildFinancialReports({
      transactions: [
        tx('x', '2026-02-01T12:00:00.000Z', [
          line('999.01', 'Ajena', 'cargo', 100),
          line('401.01', 'Ventas', 'abono', 100),
        ]),
      ],
      chart,
      year: 2026,
      monthIndex: 1,
      truncated: false,
    });
    expect(report.balanceSheet.total_activo).toBe(0);
    expect(report.balanceSheet.total_capital).toBe(100);
    expect(report.balanceSheet.is_balanced).toBe(false);
  });

  it('la liquidación mueve bancos y clientes sin tocar resultados', () => {
    const report = buildFinancialReports({
      transactions: [
        {
          id: 'pago',
          fecha: '2026-03-15T12:00:00.000Z',
          asiento_liquidacion: {
            lines: [
              line('102.01', 'Bancos', 'cargo', 1160),
              line('105.01', 'Clientes', 'abono', 1160),
            ],
          },
        },
      ],
      chart,
      year: 2026,
      monthIndex: 2,
      truncated: false,
    });
    const bancos = report.trialBalance.rows.find((row) => row.account_code === '102.01');
    const clientes = report.trialBalance.rows.find((row) => row.account_code === '105.01');
    expect(bancos?.cargos).toBe(1160);
    expect(clientes?.abonos).toBe(1160);
    expect(report.incomeStatement.total_ingresos).toBe(0);
    expect(report.incomeStatement.total_gastos).toBe(0);
    expect(report.trialBalance.sin_devengo).toBe(0);
  });
});
