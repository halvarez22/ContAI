/**
 * Agregaciones puras para la vista ejecutiva (E7.1).
 * Sin React, Firebase ni Groq.
 */

import { roundMoney } from './taxCalculatorService';
import type {
  ExecutiveSnapshot,
  ExecutiveTaxSlice,
  ExecutiveTrendPoint,
  ExecutiveTxInput,
  ExecutiveKpis,
} from '../types/executiveDashboard';

const MONTH_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${monthIndex}`;
}

function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number
): { year: number; monthIndex: number } {
  const abs = year * 12 + monthIndex + delta;
  return {
    year: Math.floor(abs / 12),
    monthIndex: ((abs % 12) + 12) % 12,
  };
}

/**
 * Una sola pasada sobre `transactions` para los últimos `months` meses
 * hasta (endYear, endMonth) inclusive.
 */
export function buildTrendSeries(
  transactions: ExecutiveTxInput[],
  endYear: number,
  endMonth: number,
  months = 6
): ExecutiveTrendPoint[] {
  const buckets = new Map<string, { ingresos: number; egresos: number }>();
  const orderedKeys: string[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const { year, monthIndex } = shiftMonth(endYear, endMonth, -i);
    const key = monthKey(year, monthIndex);
    orderedKeys.push(key);
    buckets.set(key, { ingresos: 0, egresos: 0 });
  }

  for (const tx of transactions) {
    const d = new Date(tx.fecha);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKey(d.getFullYear(), d.getMonth());
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = Number(tx.monto) || 0;
    if (tx.tipo === 'ingreso') bucket.ingresos += amount;
    else if (tx.tipo === 'egreso') bucket.egresos += amount;
  }

  return orderedKeys.map((key) => {
    const [yStr, mStr] = key.split('-');
    const year = Number(yStr);
    const monthIndex = Number(mStr);
    const b = buckets.get(key)!;
    return {
      mes: `${MONTH_SHORT[monthIndex]} ${year}`,
      ingresos: roundMoney(b.ingresos),
      egresos: roundMoney(b.egresos),
    };
  });
}

export function buildExecutiveKpis(
  periodTransactions: ExecutiveTxInput[],
  tax: ExecutiveTaxSlice
): ExecutiveKpis {
  let ingresos = 0;
  let egresos = 0;
  let bankReconciledCount = 0;

  for (const tx of periodTransactions) {
    const amount = Number(tx.monto) || 0;
    if (tx.tipo === 'ingreso') ingresos += amount;
    else if (tx.tipo === 'egreso') egresos += amount;
    if (tx.bank_reconciled === true || tx.bank_reconcile_status === 'full') {
      bankReconciledCount += 1;
    }
  }

  const txCount = periodTransactions.length;
  const isEmpty = txCount === 0;
  const warnings = [...tax.warnings];

  if (isEmpty) {
    warnings.push('No hay datos para este periodo.');
  }
  if (tax.lineasSinDesglose > 0) {
    warnings.push(
      `${tax.lineasSinDesglose} movimiento(s) sin desglose IVA — no entran en el cuadre.`
    );
  }

  return {
    periodoLabel: tax.periodoLabel,
    ivaSaldoNeto: roundMoney(tax.ivaSaldoNeto),
    flujoCajaNeto: roundMoney(ingresos - egresos),
    pctBankReconciled:
      txCount === 0 ? 0 : roundMoney((bankReconciledCount / txCount) * 100),
    isrEstimadoYtd: roundMoney(tax.isrEstimadoYtd),
    txCount,
    bankReconciledCount,
    ingresosPeriodo: roundMoney(ingresos),
    egresosPeriodo: roundMoney(egresos),
    warnings,
    isEmpty,
  };
}

export function buildExecutiveSnapshot(input: {
  allTransactions: ExecutiveTxInput[];
  periodTransactions: ExecutiveTxInput[];
  periodYear: number;
  periodMonth: number;
  tax: ExecutiveTaxSlice;
  trendMonths?: number;
}): ExecutiveSnapshot {
  const kpis = buildExecutiveKpis(input.periodTransactions, input.tax);
  const trend = buildTrendSeries(
    input.allTransactions,
    input.periodYear,
    input.periodMonth,
    input.trendMonths ?? 6
  );
  return { kpis, trend };
}
