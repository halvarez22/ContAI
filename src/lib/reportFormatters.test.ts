import { describe, expect, it } from 'vitest';
import type { IncomeStatementReport, TrialBalanceReport } from '../types/financialReports';
import {
  formatIncomeStatementToCsv,
  formatTrialBalanceToCsv,
  reportExportGate,
} from './reportFormatters';

const trial: TrialBalanceReport = {
  periodKey: '2026-01',
  rows: [
    {
      account_code: '601.84',
      account_name: 'Gastos, varios',
      naturaleza: 'gasto',
      saldo_inicial: 0,
      cargos: 100,
      abonos: 0,
      saldo_final: 100,
    },
  ],
  anomalies: [],
  total_cargos: 100,
  total_abonos: 100,
  is_balanced: true,
  truncated: false,
  sin_devengo: 0,
};

const statement: IncomeStatementReport = {
  periodKey: '2026-01',
  rows: trial.rows,
  total_ingresos: 0,
  total_gastos: 100,
  utilidad_neta: -100,
};

describe('formatTrialBalanceToCsv', () => {
  it('escribe encabezados y cita el nombre que trae coma', () => {
    const csv = formatTrialBalanceToCsv(trial);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Cuenta;Nombre;Naturaleza;Saldo inicial;Cargos;Abonos;Saldo final');
    expect(csv).toContain('"Gastos, varios"');
    expect(csv).toContain('601.84;');
  });
});

describe('formatIncomeStatementToCsv', () => {
  it('incluye la utilidad neta', () => {
    const csv = formatIncomeStatementToCsv(statement);
    expect(csv).toContain('Utilidad neta');
    expect(csv).toContain('-100');
  });
});

describe('reportExportGate', () => {
  it('bloquea la descarga preliminar y la vacía', () => {
    expect(reportExportGate({ truncated: true, rowCount: 3 }).hint).toBe(
      'Datos preliminares, exportación deshabilitada'
    );
    expect(reportExportGate({ truncated: false, rowCount: 0 }).hint).toBe('No hay datos para exportar');
    expect(reportExportGate({ truncated: false, rowCount: 2 }).disabled).toBe(false);
  });
});
