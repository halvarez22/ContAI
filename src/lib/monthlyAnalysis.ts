/** Análisis determinista sobre transacciones de un periodo (sin IA). */

import { computeMonthlyIva } from './ivaMonth';
import { computeIsrProvisionalSummary } from './isrProvisional';

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Entrada tipada para filtros / ranking / context pack (H3).
 * Campos usados en App + monthlyAnalysis; sin index signature `unknown`.
 */
export type AnalysisTransaction = {
  id?: string;
  fecha: string;
  tipo: string;
  monto: number | string;
  proveedor?: string;
  concepto?: string;
  account_name?: string;
  status?: string;
  confidence_score?: number;
  iva_tasa?: string | number | null;
  egreso_acredita_iva?: boolean | string | null;
  deducible?: boolean | null;
  bank_reconciled?: boolean;
  bank_reconcile_status?: 'none' | 'partial' | 'full' | string;
  bank_reconciled_amount?: number;
  /** E13.1 — metadatos nómina (exportación E13.2) */
  is_nomina?: boolean;
  nomina_isr_retained?: number;
  nomina_imss_retained?: number;
  nomina_total_percepciones?: number;
  rfc_contraparte?: string;
  tags?: string[];
  moneda?: string;
};

/** Transacciones del 1 ene al último día del mes indicado (mismo año). */
export function filterTransactionsYtdThroughMonth(
  transactions: AnalysisTransaction[],
  year: number,
  monthIndex: number
): AnalysisTransaction[] {
  const start = new Date(year, 0, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return transactions.filter((tx) => {
    const d = new Date(tx.fecha);
    if (Number.isNaN(d.getTime())) return false;
    return d >= start && d <= end;
  });
}

export type RankedTransaction = AnalysisTransaction & { id: string };

export interface RiskRow {
  transactionId: string;
  transaction: RankedTransaction;
  score: number;
  reasons: string[];
  severity: RiskSeverity;
}

export function filterTransactionsByMonth(
  transactions: AnalysisTransaction[],
  year: number,
  monthIndex: number
): AnalysisTransaction[] {
  return transactions.filter((tx) => {
    const d = new Date(tx.fecha);
    return d.getFullYear() === year && d.getMonth() === monthIndex;
  });
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(idx, sortedAsc.length - 1))];
}

function normProvider(p: string | undefined): string {
  return String(p || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function computeRiskRankings(
  monthTransactions: AnalysisTransaction[],
  highAmountThreshold = 50000
): RiskRow[] {
  const list = monthTransactions.filter(
    (tx): tx is RankedTransaction => Boolean(tx?.id)
  );
  const egresoByCategory: Record<string, number[]> = {};
  for (const tx of list) {
    if (tx.tipo !== 'egreso') continue;
    const cat = tx.account_name || 'Sin clasificar';
    if (!egresoByCategory[cat]) egresoByCategory[cat] = [];
    egresoByCategory[cat].push(Number(tx.monto) || 0);
  }
  const p95ByCat: Record<string, number> = {};
  for (const [cat, amounts] of Object.entries(egresoByCategory)) {
    const sorted = [...amounts].sort((a, b) => a - b);
    p95ByCat[cat] = percentile(sorted, 95);
  }

  const dupKeyCount: Record<string, number> = {};
  for (const tx of list) {
    const m = Number(tx.monto) || 0;
    const key = `${dayKey(tx.fecha)}|${normProvider(tx.proveedor)}|${Math.round(m * 100)}`;
    dupKeyCount[key] = (dupKeyCount[key] || 0) + 1;
  }

  const providerDayCount: Record<string, number> = {};
  for (const tx of list) {
    const key = `${dayKey(tx.fecha)}|${normProvider(tx.proveedor)}`;
    providerDayCount[key] = (providerDayCount[key] || 0) + 1;
  }

  const rows: RiskRow[] = [];

  for (const tx of list) {
    let score = 0;
    const reasons: string[] = [];
    const m = Number(tx.monto) || 0;

    if (m >= highAmountThreshold) {
      score += 28;
      reasons.push(`Monto ≥ ${highAmountThreshold.toLocaleString('es-MX')} (política)`);
    }

    if (tx.status === 'revisión') {
      score += 18;
      reasons.push('Marcada en revisión');
    }

    if (tx.status === 'rechazado') {
      score += 12;
      reasons.push('Transacción rechazada');
    }

    const conf = tx.confidence_score;
    if (typeof conf === 'number' && conf < 0.72) {
      score += 12;
      reasons.push('Confianza IA baja');
    }

    if (tx.tipo === 'egreso') {
      const cat = tx.account_name || 'Sin clasificar';
      const p95 = p95ByCat[cat] || 0;
      if (p95 > 0 && m > p95) {
        score += 22;
        reasons.push(`Egreso por encima del percentil 95 en «${cat}»`);
      }
    }

    const dk = `${dayKey(tx.fecha)}|${normProvider(tx.proveedor)}|${Math.round(m * 100)}`;
    if (dupKeyCount[dk] > 1) {
      score += 26;
      reasons.push('Posible duplicado (mismo día, proveedor y monto similar)');
    }

    const pdk = `${dayKey(tx.fecha)}|${normProvider(tx.proveedor)}`;
    if ((providerDayCount[pdk] || 0) >= 3) {
      score += 14;
      reasons.push('Varios movimientos el mismo día con el mismo proveedor');
    }

    score = Math.min(100, Math.round(score));

    let severity: RiskSeverity = 'low';
    if (score >= 75) severity = 'critical';
    else if (score >= 50) severity = 'high';
    else if (score >= 25) severity = 'medium';

    rows.push({
      transactionId: String(tx.id),
      transaction: tx,
      score,
      reasons,
      severity,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export interface MonthlyContextPack {
  periodo: string;
  empresa: string;
  rfc: string;
  resumen: {
    totalIngresos: number;
    totalEgresos: number;
    nTransacciones: number;
    saldoNeto: number;
  };
  por_cuenta: Record<string, { ingresos: number; egresos: number }>;
  top_proveedores_egreso: { proveedor: string; total: number }[];
  muestra_transacciones: Array<{
    id: string;
    fecha: string;
    tipo: string;
    monto: number;
    proveedor: string;
    concepto: string;
    cuenta: string;
    estado: string;
  }>;
  /** IVA / ISR informativos (v1); requiere campos fiscales en transacciones */
  fiscal?: {
    iva: {
      ivaTrasladadoTotal: number;
      ivaAcreditableTotal: number;
      saldoNetoIva: number;
      lineasSinDesglose: number;
    };
    isr_ytd: {
      ingresosAcumulables: number;
      deduccionesAcumuladas: number;
      baseGravable: number;
      isrEstimado: number;
      nota: string;
      mesFactor?: string;
    };
  };
}

export function buildMonthlyContextPack(
  monthTransactions: AnalysisTransaction[],
  year: number,
  monthIndex: number,
  empresaNombre: string,
  empresaRfc: string,
  allTransactionsForFiscal?: AnalysisTransaction[]
): MonthlyContextPack {
  const d = new Date(year, monthIndex, 1);
  const periodo = d.toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  let totalIngresos = 0;
  let totalEgresos = 0;
  const porCuenta: Record<string, { ingresos: number; egresos: number }> = {};
  const provEgreso: Record<string, number> = {};

  for (const tx of monthTransactions) {
    const amount = Number(tx.monto) || 0;
    const cuenta = tx.account_name || 'Sin clasificar';
    if (!porCuenta[cuenta]) porCuenta[cuenta] = { ingresos: 0, egresos: 0 };

    if (tx.tipo === 'ingreso') {
      totalIngresos += amount;
      porCuenta[cuenta].ingresos += amount;
    } else {
      totalEgresos += amount;
      porCuenta[cuenta].egresos += amount;
      const p = String(tx.proveedor || '').trim() || 'Sin proveedor';
      provEgreso[p] = (provEgreso[p] || 0) + amount;
    }
  }

  const topProveedores = Object.entries(provEgreso)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([proveedor, total]) => ({ proveedor, total }));

  const muestra = monthTransactions.slice(0, 40).map((tx) => ({
    id: String(tx.id),
    fecha: typeof tx.fecha === 'string' ? tx.fecha : String(tx.fecha),
    tipo: tx.tipo,
    monto: Number(tx.monto) || 0,
    proveedor: String(tx.proveedor || ''),
    concepto: String(tx.concepto || ''),
    cuenta: tx.account_name || 'Sin clasificar',
    estado: tx.status || '',
  }));

  const pack: MonthlyContextPack = {
    periodo,
    empresa: empresaNombre || '',
    rfc: empresaRfc || '',
    resumen: {
      totalIngresos,
      totalEgresos,
      nTransacciones: monthTransactions.length,
      saldoNeto: totalIngresos - totalEgresos,
    },
    por_cuenta: porCuenta,
    top_proveedores_egreso: topProveedores,
    muestra_transacciones: muestra,
  };

  if (allTransactionsForFiscal && allTransactionsForFiscal.length >= 0) {
    const iva = computeMonthlyIva(monthTransactions, year, monthIndex);
    const ytd = filterTransactionsYtdThroughMonth(allTransactionsForFiscal, year, monthIndex);
    const isr = computeIsrProvisionalSummary(ytd, monthIndex);
    pack.fiscal = {
      iva: {
        ivaTrasladadoTotal: iva.ivaTrasladadoTotal,
        ivaAcreditableTotal: iva.ivaAcreditableTotal,
        saldoNetoIva: iva.saldoNetoIva,
        lineasSinDesglose: iva.lineasSinDesglose,
      },
      isr_ytd: {
        ingresosAcumulables: isr.ingresosAcumulables,
        deduccionesAcumuladas: isr.deduccionesAcumuladas,
        baseGravable: isr.baseGravable,
        isrEstimado: isr.isrEstimadoAnual.isr,
        nota: isr.nota,
        mesFactor: `${monthIndex + 1}/12`,
      },
    };
  }

  return pack;
}
