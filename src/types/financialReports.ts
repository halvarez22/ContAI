/**
 * Balanza de comprobación y estado de resultados (E17).
 */

import type { AccountNaturaleza } from './chartOfAccounts';

export const AUDIT_BALANZA_COMPROBACION_GENERADA = 'BALANZA_COMPROBACION_GENERADA';
export const AUDIT_ESTADO_RESULTADOS_GENERADO = 'ESTADO_RESULTADOS_GENERADO';

export const TRIAL_BALANCE_TRUNCATED_HINT =
  'La lectura del año llegó al tope de 5,000 movimientos. Esta balanza es preliminar y puede estar incompleta.';

export const TRIAL_BALANCE_UNBALANCED_HINT =
  'La balanza no cuadra: la suma de cargos del mes no es igual a la suma de abonos.';

export type ReportRow = {
  account_code: string;
  account_name: string;
  naturaleza: AccountNaturaleza;
  saldo_inicial: number;
  cargos: number;
  abonos: number;
  saldo_final: number;
};

export type ReportAnomaly = {
  account_code: string;
  transaction_id: string;
  message: string;
  cargos: number;
  abonos: number;
};

export type TrialBalanceReport = {
  periodKey: string;
  rows: ReportRow[];
  anomalies: ReportAnomaly[];
  total_cargos: number;
  total_abonos: number;
  is_balanced: boolean;
  truncated: boolean;
  sin_devengo: number;
};

export type IncomeStatementReport = {
  periodKey: string;
  rows: ReportRow[];
  total_ingresos: number;
  total_gastos: number;
  utilidad_neta: number;
};

export type FinancialReports = {
  trialBalance: TrialBalanceReport;
  incomeStatement: IncomeStatementReport;
};
