/**
 * Balanza y estado de resultados (E17). Puro: sin Firebase ni React.
 */

import type { AccountNaturaleza, CatalogAccount } from '../types/chartOfAccounts';
import type {
  BalanceSheetReport,
  FinancialReports,
  ReportAnomaly,
  ReportRow,
} from '../types/financialReports';
import { UTILIDAD_EJERCICIO_LABEL } from '../types/financialReports';
import type { JournalLine } from '../types/journalEntry';
import { periodKey } from '../lib/periodClose';
import { roundMoney } from '../types/paymentApplication';

export type ReportTransaction = {
  id?: string;
  fecha: string;
  asiento_devengo?: unknown;
  asiento_liquidacion?: unknown;
};

type Bucket = {
  code: string;
  name: string;
  naturaleza: AccountNaturaleza;
  tipo_iva?: CatalogAccount['tipo_iva'];
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
    ...(bucket.tipo_iva ? { tipo_iva: bucket.tipo_iva } : {}),
    saldo_inicial: saldoInicial,
    cargos: bucket.cargos,
    abonos: bucket.abonos,
    saldo_final: saldoFinal,
  };
}

function absorbJournal(
  raw: unknown,
  phase: 'month' | 'opening',
  transactionId: string,
  illegibleMessage: string,
  chart: Map<string, CatalogAccount>,
  buckets: Map<string, Bucket>,
  anomalies: ReportAnomaly[]
): { cargos: number; abonos: number } {
  const lines = readLines(raw);
  if (!lines) {
    anomalies.push({
      account_code: '',
      transaction_id: transactionId,
      message: illegibleMessage,
      cargos: 0,
      abonos: 0,
    });
    return { cargos: 0, abonos: 0 };
  }
  let cargos = 0;
  let abonos = 0;
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
        cargos = roundMoney(cargos + cargo);
        abonos = roundMoney(abonos + abono);
      }
      continue;
    }
    const current = buckets.get(account.code) ?? {
      code: account.code,
      name: account.name,
      naturaleza: account.naturaleza,
      ...(account.tipo_iva ? { tipo_iva: account.tipo_iva } : {}),
      openingNet: 0,
      cargos: 0,
      abonos: 0,
    };
    if (phase === 'opening') {
      current.openingNet = roundMoney(current.openingNet + cargo - abono);
    } else {
      current.cargos = roundMoney(current.cargos + cargo);
      current.abonos = roundMoney(current.abonos + abono);
      cargos = roundMoney(cargos + cargo);
      abonos = roundMoney(abonos + abono);
    }
    buckets.set(account.code, current);
  }
  return { cargos, abonos };
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
    const sources: Array<{ raw: unknown; illegible: string }> = [];
    if (tx.asiento_devengo != null) {
      sources.push({ raw: tx.asiento_devengo, illegible: 'Asiento de devengo ilegible.' });
    }
    if (tx.asiento_liquidacion != null) {
      sources.push({
        raw: tx.asiento_liquidacion,
        illegible: 'Asiento de liquidación ilegible.',
      });
    }
    if (sources.length === 0) {
      if (phase === 'month') sinDevengo += 1;
      continue;
    }
    for (const source of sources) {
      const absorbed = absorbJournal(
        source.raw,
        phase,
        transactionId,
        source.illegible,
        chart,
        buckets,
        anomalies
      );
      totalCargos = roundMoney(totalCargos + absorbed.cargos);
      totalAbonos = roundMoney(totalAbonos + absorbed.abonos);
    }
  }

  return { buckets, anomalies, totalCargos, totalAbonos, sinDevengo };
}

function balanceGroup(
  account: CatalogAccount | undefined,
  naturaleza: ReportRow['naturaleza']
): 'activo' | 'pasivo' | 'capital' | null {
  if (naturaleza === 'activo') return 'activo';
  if (naturaleza === 'pasivo') return 'pasivo';
  if (naturaleza === 'capital') return 'capital';
  if (naturaleza === 'iva' && account?.tipo_iva === 'acreditable') return 'activo';
  if (naturaleza === 'iva' && account?.tipo_iva === 'trasladado') return 'pasivo';
  return null;
}

function buildBalanceSheet(
  trialRows: readonly ReportRow[],
  chart: Map<string, CatalogAccount>,
  utilidadNeta: number,
  key: string,
  truncated: boolean
): BalanceSheetReport {
  const rows: ReportRow[] = [];
  let totalActivo = 0;
  let totalPasivo = 0;
  let totalCapital = 0;

  for (const row of trialRows) {
    const group = balanceGroup(chart.get(row.account_code), row.naturaleza);
    if (!group) continue;
    rows.push(row);
    if (group === 'activo') {
      totalActivo = roundMoney(totalActivo + row.saldo_final);
    } else if (group === 'pasivo') {
      totalPasivo = roundMoney(totalPasivo - row.saldo_final);
    } else {
      totalCapital = roundMoney(totalCapital - row.saldo_final);
    }
  }

  if (utilidadNeta !== 0) {
    rows.push({
      account_code: '',
      account_name: UTILIDAD_EJERCICIO_LABEL,
      naturaleza: 'capital',
      saldo_inicial: 0,
      cargos: 0,
      abonos: 0,
      saldo_final: utilidadNeta,
    });
    totalCapital = roundMoney(totalCapital + utilidadNeta);
  }

  const total_activo = roundMoney(totalActivo);
  const total_pasivo = roundMoney(totalPasivo);
  const total_capital = roundMoney(totalCapital);
  return {
    periodKey: key,
    rows,
    total_activo,
    total_pasivo,
    total_capital,
    is_balanced: total_activo === roundMoney(total_pasivo + total_capital),
    truncated,
  };
}

export function buildFinancialReports(input: {
  transactions: readonly ReportTransaction[];
  chart: readonly CatalogAccount[];
  year: number;
  monthIndex: number;
  truncated: boolean;
}): FinancialReports {
  const key = periodKey(input.year, input.monthIndex);
  const chart = activeChart(input.chart);
  const { buckets, anomalies, totalCargos, totalAbonos, sinDevengo } = aggregateEntries(
    input.transactions,
    chart,
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
    balanceSheet: buildBalanceSheet(
      rows,
      chart,
      roundMoney(totalIngresos - totalGastos),
      key,
      input.truncated
    ),
  };
}
