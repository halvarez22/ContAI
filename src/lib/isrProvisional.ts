import { parseIvaTasa, splitTotalWithIva } from './fiscal';

/**
 * ISR provisional PFAE — estimación interna.
 * Tarifa anual 2024 (art. 152 LISR) según tablas publicadas en fuentes oficiales;
 * para el mes m del ejercicio se aplican límites y cuotas proporcionales (m/12) al acumulado YTD,
 * coherente con pagos provisionales por periodos acumulados. Verificar siempre contra el SAT.
 */

export interface IsrBracket {
  limiteInferior: number;
  limiteSuperior: number;
  cuotaFija: number;
  tasaExcedente: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tarifa anual 2024 personas físicas (límites en pesos) — fuente: tablas ISR 2024 SAT / RMF */
export const ISR_BRACKETS_2024_ANUAL: IsrBracket[] = [
  { limiteInferior: 0.01, limiteSuperior: 8952.49, cuotaFija: 0, tasaExcedente: 0.0192 },
  { limiteInferior: 8952.5, limiteSuperior: 75984.55, cuotaFija: 171.88, tasaExcedente: 0.064 },
  { limiteInferior: 75984.56, limiteSuperior: 133536.07, cuotaFija: 4461.94, tasaExcedente: 0.1088 },
  { limiteInferior: 133536.08, limiteSuperior: 155229.8, cuotaFija: 10723.55, tasaExcedente: 0.16 },
  { limiteInferior: 155229.81, limiteSuperior: 185852.57, cuotaFija: 14194.54, tasaExcedente: 0.1792 },
  { limiteInferior: 185852.58, limiteSuperior: 374837.88, cuotaFija: 19682.13, tasaExcedente: 0.2136 },
  { limiteInferior: 374837.89, limiteSuperior: 590795.99, cuotaFija: 60049.4, tasaExcedente: 0.2352 },
  { limiteInferior: 590796.0, limiteSuperior: 1127926.84, cuotaFija: 110842.74, tasaExcedente: 0.3 },
  { limiteInferior: 1127926.85, limiteSuperior: 1503902.46, cuotaFija: 271981.99, tasaExcedente: 0.32 },
  { limiteInferior: 1503902.47, limiteSuperior: 4511707.37, cuotaFija: 392294.17, tasaExcedente: 0.34 },
  { limiteInferior: 4511707.38, limiteSuperior: Number.POSITIVE_INFINITY, cuotaFija: 1414947.85, tasaExcedente: 0.35 },
];

/** Límites y cuotas fijas escalados por (mes/12) para comparar base acumulada YTD al mes `monthIndex` (0-11). */
export function scaleBracketsForCumulativeMonth(
  annual: IsrBracket[],
  monthIndex: number
): IsrBracket[] {
  const factor = (monthIndex + 1) / 12;
  return annual.map((b) => ({
    limiteInferior: round2(b.limiteInferior * factor),
    limiteSuperior:
      b.limiteSuperior === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : round2(b.limiteSuperior * factor),
    cuotaFija: round2(b.cuotaFija * factor),
    tasaExcedente: b.tasaExcedente,
  }));
}

export function isrFromBracketTable(
  baseGravable: number,
  brackets: IsrBracket[]
): { isr: number; tramo: number; detalle: string } {
  if (baseGravable <= 0) return { isr: 0, tramo: -1, detalle: 'Base gravable ≤ 0' };
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    if (baseGravable >= b.limiteInferior && baseGravable <= b.limiteSuperior) {
      const excedente = baseGravable - b.limiteInferior;
      const isr = b.cuotaFija + excedente * b.tasaExcedente;
      return {
        isr,
        tramo: i,
        detalle: `Cuota fija ${b.cuotaFija} + ${(b.tasaExcedente * 100).toFixed(2)}% sobre excedente (tramo ${i + 1})`,
      };
    }
  }
  return { isr: 0, tramo: -1, detalle: 'Sin tramo aplicable' };
}

/** Base anual completa (sin escalar por mes) — referencia. */
export function isrFromAnnualBase(baseGravable: number): { isr: number; tramo: number; detalle: string } {
  return isrFromBracketTable(baseGravable, ISR_BRACKETS_2024_ANUAL);
}

export function sumIngresosAcumulables(transactions: any[]): number {
  let s = 0;
  for (const tx of transactions) {
    if (tx.tipo !== 'ingreso') continue;
    const monto = Number(tx.monto) || 0;
    const tasa = parseIvaTasa(tx.iva_tasa);
    const { subtotal } = splitTotalWithIva(monto, tasa);
    s += subtotal;
  }
  return s;
}

export function sumDeduccionesAutorizadas(transactions: any[]): number {
  let s = 0;
  for (const tx of transactions) {
    if (tx.tipo !== 'egreso') continue;
    if (tx.deducible === false) continue;
    const monto = Number(tx.monto) || 0;
    const tasa = parseIvaTasa(tx.iva_tasa);
    const { subtotal } = splitTotalWithIva(monto, tasa);
    s += subtotal;
  }
  return s;
}

export interface IsrProvisionalSummary {
  ingresosAcumulables: number;
  deduccionesAcumuladas: number;
  baseGravable: number;
  isrEstimadoAnual: { isr: number; detalle: string };
  /** Mes del periodo (0-11) usado para factor m/12 */
  mesAplicado: number;
  nota: string;
}

export function computeIsrProvisionalSummary(
  transactionsYearToDate: any[],
  monthIndex: number
): IsrProvisionalSummary {
  const ingresosAcumulables = sumIngresosAcumulables(transactionsYearToDate);
  const deduccionesAcumuladas = sumDeduccionesAutorizadas(transactionsYearToDate);
  const baseGravable = Math.max(0, ingresosAcumulables - deduccionesAcumuladas);
  const brackets = scaleBracketsForCumulativeMonth(ISR_BRACKETS_2024_ANUAL, monthIndex);
  const isrEstimadoAnual = isrFromBracketTable(baseGravable, brackets);
  const m = monthIndex + 1;
  return {
    ingresosAcumulables,
    deduccionesAcumuladas,
    baseGravable,
    isrEstimadoAnual: { isr: isrEstimadoAnual.isr, detalle: isrEstimadoAnual.detalle },
    mesAplicado: monthIndex,
    nota: `ISR sobre base acumulada YTD con tarifa 2024 y límites escalados por (${m}/12). Validar con contador y lineamientos vigentes del SAT.`,
  };
}
