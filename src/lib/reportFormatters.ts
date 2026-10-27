/**
 * CSV de balanza y estado de resultados. Puro: sin React ni Firebase.
 */

import type { IncomeStatementReport, TrialBalanceReport } from '../types/financialReports';
import { EXPORT_EMPTY_HINT, EXPORT_TRUNCATED_HINT } from '../types/financialReports';

const SEPARATOR = ';';

function csvField(value: string | number): string {
  const text = String(value);
  if (/[;,"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvLine(cells: readonly (string | number)[]): string {
  const fields: string[] = [];
  for (const cell of cells) fields.push(csvField(cell));
  return fields.join(SEPARATOR);
}

export function reportExportGate(input: { truncated: boolean; rowCount: number }): {
  disabled: boolean;
  hint: string;
} {
  if (input.truncated) return { disabled: true, hint: EXPORT_TRUNCATED_HINT };
  if (input.rowCount === 0) return { disabled: true, hint: EXPORT_EMPTY_HINT };
  return { disabled: false, hint: '' };
}

export function formatTrialBalanceToCsv(report: TrialBalanceReport): string {
  const lines = [
    csvLine(['Cuenta', 'Nombre', 'Naturaleza', 'Saldo inicial', 'Cargos', 'Abonos', 'Saldo final']),
  ];
  for (const row of report.rows) {
    lines.push(
      csvLine([
        row.account_code,
        row.account_name,
        row.naturaleza,
        row.saldo_inicial,
        row.cargos,
        row.abonos,
        row.saldo_final,
      ])
    );
  }
  lines.push(csvLine(['', 'Totales del mes', '', '', report.total_cargos, report.total_abonos, '']));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function formatIncomeStatementToCsv(report: IncomeStatementReport): string {
  const lines = [csvLine(['Cuenta', 'Nombre', 'Naturaleza', 'Cargos', 'Abonos', 'Resultado'])];
  for (const row of report.rows) {
    lines.push(
      csvLine([
        row.account_code,
        row.account_name,
        row.naturaleza,
        row.cargos,
        row.abonos,
        row.saldo_final,
      ])
    );
  }
  lines.push(csvLine(['', 'Ingresos', '', '', '', report.total_ingresos]));
  lines.push(csvLine(['', 'Gastos', '', '', '', report.total_gastos]));
  lines.push(csvLine(['', 'Utilidad neta', '', '', '', report.utilidad_neta]));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
