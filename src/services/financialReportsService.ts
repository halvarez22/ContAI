/**
 * Balanza y estado de resultados (E17). Puro: sin Firebase ni React.
 */

import type { AccountNaturaleza, CatalogAccount } from '../types/chartOfAccounts';
import type {
  FinancialReports,
  ReportAnomaly,
  ReportRow,
} from '../types/financialReports';
import type { JournalLine } from '../types/journalEntry';
import { periodKey } from '../lib/periodClose';
import { roundMoney } from '../types/paymentApplication';

export type ReportTransaction = {
  id?: string;
  fecha: string;
  asiento_devengo?: unknown;
};

type Bucket = {
  code: string;
  name: string;
  naturaleza: AccountNaturaleza;
  openingNet: number;
  cargos: number;
  abonos: number;
};

function calendarOf(fecha: string): { year: number; month: number } | null {
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getFullYear(), month: parsed.getMonth() };
}

function activeChart(chart: readonly CatalogAccount[]): Map<string, CatalogAccount> {
  const map = new Map<string, CatalogAccount>();
  for (const account of chart) {
    if (account.activa) map.set(account.code, account);
  }
  return map;
}

function readLines(raw: unknown): JournalLine[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!Array.isArray(row.lines)) return null;
  const lines: JournalLine[] = [];
  for (const item of row.lines) {
    if (!item || typeof item !== 'object') return null;
    const line = item as Record<string, unknown>;
    if (line.tipo !== 'cargo' && line.tipo !== 'abono') return null;
    if (typeof line.account_code !== 'string' || typeof line.account_name !== 'string') return null;
    if (typeof line.monto !== 'number' || !Number.isFinite(line.monto)) return null;
    if (typeof line.concepto !== 'string') return null;
    lines.push({
      account_code: line.account_code,
      account_name: line.account_name,
      tipo: line.tipo,
      monto: line.monto,
      concepto: line.concepto,
    });
  }
  return lines;
}

function hasMovement(bucket: Bucket): boolean {
  return bucket.openingNet !== 0 || bucket.cargos !== 0 || bucket.abonos !== 0;
}

function toRow(bucket: Bucket, saldoInicial: number): ReportRow {
  const saldoFinal = roundMoney(saldoInicial + bucket.cargos - bucket.abonos);
  return {
    account_code: bucket.code,
    account_name: bucket.name,
    naturaleza: bucket.naturaleza,
    saldo_inicial: saldoInicial,
    cargos: bucket.cargos,
    abonos: bucket.abonos,
    saldo_final: saldoFinal,
  };
}

function aggregateEntries(
  transactions: readonly ReportTransaction[],
  chart: Map<string, CatalogAccount>,
  year: number,
  monthIndex: number
): {
  buckets: Map<string, Bucket>;
  anomalies: ReportAnomaly[];
  totalCargos: number;
  totalAbonos: number;
  sinDevengo: number;
} {
  const buckets = new Map<string, Bucket>();
  const anomalies: ReportAnomaly[] = [];
  let totalCargos = 0;
  let totalAbonos = 0;
  let sinDevengo = 0;

  for (const tx of transactions) {
    const when = calendarOf(tx.fecha);
    const transactionId = String(tx.id ?? '');
    if (!when || when.year !== year || when.month > monthIndex) continue;
    const phase = when.month === monthIndex ? 'month' : 'opening';
    if (tx.asiento_devengo == null) {
      if (phase === 'month') sinDevengo += 1;
      continue;
    }
    const lines = readLines(tx.asiento_devengo);
    if (!lines) {
      anomalies.push({
        account_code: '',
        transaction_id: transactionId,
        message: 'Asiento de devengo ilegible.',
        cargos: 0,
        abonos: 0,
      });
      continue;
    }
    for (const line of lines) {
      const cargo = line.tipo === 'cargo' ? roundMoney(line.monto) : 0;
      const abono = line.tipo === 'abono' ? roundMoney(line.monto) : 0;
      const account = chart.get(line.account_code);
      if (!account) {
        anomalies.push({
          account_code: line.account_code,
          transaction_id: transactionId,
          message:
            phase === 'opening'
              ? 'Cuenta sin catálogo en el saldo inicial.'
              : 'Cuenta sin catálogo.',
          cargos: cargo,
          abonos: abono,
        });
        if (phase === 'month') {
          totalCargos = roundMoney(totalCargos + cargo);
          totalAbonos = roundMoney(totalAbonos + abono);
        }
        continue;
      }
      const current = buckets.get(account.code) ?? {
        code: account.code,
        name: account.name,
        naturaleza: account.naturaleza,
        openingNet: 0,
        cargos: 0,
        abonos: 0,
      };
      if (phase === 'opening') {
        current.openingNet = roundMoney(current.openingNet + cargo - abono);
      } else {
        current.cargos = roundMoney(current.cargos + cargo);
        current.abonos = roundMoney(current.abonos + abono);
        totalCargos = roundMoney(totalCargos + cargo);
        totalAbonos = roundMoney(totalAbonos + abono);
      }
      buckets.set(account.code, current);
    }
  }

  return { buckets, anomalies, totalCargos, totalAbonos, sinDevengo };
}

export function buildFinancialReports(input: {
  transactions: readonly ReportTransaction[];
  chart: readonly CatalogAccount[];
  year: number;
  monthIndex: number;
  truncated: boolean;
}): FinancialReports {
  const key = periodKey(input.year, input.monthIndex);
  const { buckets, anomalies, totalCargos, totalAbonos, sinDevengo } = aggregateEntries(
    input.transactions,
    activeChart(input.chart),
    input.year,
    input.monthIndex
  );

  const rows: ReportRow[] = [];
  const incomeRows: ReportRow[] = [];
  let totalIngresos = 0;
  let totalGastos = 0;

  const ordered = [...buckets.values()].sort((a, b) => a.code.localeCompare(b.code));
  for (const bucket of ordered) {
    if (!hasMovement(bucket)) continue;
    const row = toRow(bucket, bucket.openingNet);
    rows.push(row);
    if (bucket.naturaleza !== 'ingreso' && bucket.naturaleza !== 'gasto') continue;
    if (bucket.cargos === 0 && bucket.abonos === 0) continue;
    const statementRow: ReportRow = {
      ...row,
      saldo_inicial: 0,
      saldo_final: roundMoney(bucket.cargos - bucket.abonos),
    };
    incomeRows.push(statementRow);
    if (bucket.naturaleza === 'ingreso') {
      totalIngresos = roundMoney(totalIngresos + bucket.abonos - bucket.cargos);
    } else {
      totalGastos = roundMoney(totalGastos + bucket.cargos - bucket.abonos);
    }
  }

  return {
    trialBalance: {
      periodKey: key,
      rows,
      anomalies,
      total_cargos: totalCargos,
      total_abonos: totalAbonos,
      is_balanced: totalCargos === totalAbonos,
      truncated: input.truncated,
      sin_devengo: sinDevengo,
    },
    incomeStatement: {
      periodKey: key,
      rows: incomeRows,
      total_ingresos: totalIngresos,
      total_gastos: totalGastos,
      utilidad_neta: roundMoney(totalIngresos - totalGastos),
    },
  };
}
