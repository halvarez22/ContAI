/**
 * Servicio puro de previo fiscal.
 * Tasas oficiales solo vía taxRates. ISR delega a isrProvisional (brackets intactos).
 * Sin React, Firebase ni HTTP.
 */

import {
  buildFiscalSnapshot,
  parseIvaTasa,
  splitTotalWithIva,
  type IvaTasaCode,
} from '../config/taxRates';
import { computeMonthlyIva, type IvaTransactionInput } from '../lib/ivaMonth';
import {
  computeIsrProvisionalSummary,
  type IsrTransactionInput,
} from '../lib/isrProvisional';
import { parseBool } from '../lib/fiscal';
import type { AgentDecision } from '../types/agentDecision';
import type {
  GroqTaxHints,
  TaxPreview,
  TaxPreviewInput,
  TaxTransactionInput,
} from '../types/taxPreview';

export const TAX_PREVIEW_DISCLAIMER =
  'Estimación interna informativa. No sustituye declaraciones ni cálculos oficiales ante el SAT. Valide con su contador.';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** IVA de una línea: monto = total (incluye IVA cuando aplica). */
export function calculateLineIva(
  total: number,
  tasaCode: IvaTasaCode | string | null | undefined
): { subtotal: number; iva: number; tasa: IvaTasaCode } {
  const tasa = parseIvaTasa(tasaCode == null ? 'na' : String(tasaCode));
  if (!Number.isFinite(total) || total < 0) {
    return { subtotal: 0, iva: 0, tasa };
  }
  const { subtotal, iva } = splitTotalWithIva(total, tasa);
  return {
    subtotal: roundMoney(subtotal),
    iva: roundMoney(iva),
    tasa,
  };
}

function toLibTx(
  tx: TaxTransactionInput
): IsrTransactionInput & IvaTransactionInput {
  return {
    tipo: tx.tipo,
    monto: Number(tx.monto) || 0,
    iva_tasa: tx.iva_tasa,
    egreso_acredita_iva: tx.egreso_acredita_iva,
    deducible: tx.deducible,
  };
}

/**
 * Previo consolidado IVA (mes) + ISR (YTD) para UI e insights.
 */
export function buildTaxPreview(input: TaxPreviewInput): TaxPreview {
  const { year, monthIndex } = input;
  const monthTxs = input.monthTransactions.map(toLibTx);
  const ytdTxs = input.ytdTransactions.map(toLibTx);

  const ivaRaw = computeMonthlyIva(monthTxs, year, monthIndex);
  const isrRaw = computeIsrProvisionalSummary(ytdTxs, monthIndex);

  const warnings: string[] = [];
  if (input.monthTransactions.length === 0) {
    warnings.push('No hay movimientos en el periodo seleccionado.');
  }
  if (ivaRaw.lineasSinDesglose > 0) {
    warnings.push(
      `${ivaRaw.lineasSinDesglose} movimiento(s) con tasa N/A — no entran en el cuadre IVA.`
    );
  }

  const roundMap = (m: Record<string, { subtotal: number; iva: number }>) => {
    const out: Record<string, { subtotal: number; iva: number }> = {};
    for (const [k, v] of Object.entries(m)) {
      out[k] = { subtotal: roundMoney(v.subtotal), iva: roundMoney(v.iva) };
    }
    return out;
  };

  return {
    periodoLabel: ivaRaw.periodo,
    year,
    monthIndex,
    iva: {
      trasladado: roundMoney(ivaRaw.ivaTrasladadoTotal),
      acreditable: roundMoney(ivaRaw.ivaAcreditableTotal),
      saldoNeto: roundMoney(ivaRaw.saldoNetoIva),
      porTasaIngreso: roundMap(ivaRaw.porTasaIngreso),
      porTasaEgresoAcreditable: roundMap(ivaRaw.porTasaEgresoAcred),
      lineasSinDesglose: ivaRaw.lineasSinDesglose,
    },
    isr: {
      ingresosAcumulablesYtd: roundMoney(isrRaw.ingresosAcumulables),
      deduccionesYtd: roundMoney(isrRaw.deduccionesAcumuladas),
      baseGravableYtd: roundMoney(isrRaw.baseGravable),
      isrEstimado: roundMoney(isrRaw.isrEstimadoAnual.isr),
      detalleTramo: isrRaw.isrEstimadoAnual.detalle,
      mesAplicado: isrRaw.mesAplicado,
      nota: isrRaw.nota,
    },
    warnings,
    disclaimer: TAX_PREVIEW_DISCLAIMER,
  };
}

/**
 * Mapea JSON / AgentDecision de Groq a hints fiscales.
 * Nunca inventa tasas IVA; solo campos sugeridos tipados.
 */
export function mapGroqTaxJson(input: unknown): GroqTaxHints {
  if (input == null || typeof input !== 'object') {
    return {};
  }
  const o = input as Record<string, unknown>;
  const hints: GroqTaxHints = {};

  if (typeof o.tax_deductible === 'boolean') {
    hints.tax_deductible = o.tax_deductible;
  }

  if (typeof o.reason === 'string' && o.reason.trim()) {
    hints.notes = o.reason.trim().slice(0, 500);
  } else if (typeof o.notes === 'string' && o.notes.trim()) {
    hints.notes = o.notes.trim().slice(0, 500);
  }

  return hints;
}

/** Atajo tipado desde AgentDecision. */
export function mapAgentDecisionTaxHints(decision: AgentDecision): GroqTaxHints {
  return mapGroqTaxJson(decision);
}

/** Snapshot de línea (ingreso/egreso) usando catálogo taxRates. */
export function lineFiscalSnapshot(
  tipo: 'ingreso' | 'egreso',
  monto: number,
  iva_tasa: IvaTasaCode | string | null | undefined,
  egreso_acredita_iva: boolean | string | null | undefined = true
) {
  const tasa = parseIvaTasa(iva_tasa == null ? 'na' : String(iva_tasa));
  const acredita = parseBool(
    egreso_acredita_iva === null || egreso_acredita_iva === undefined
      ? undefined
      : String(egreso_acredita_iva),
    true
  );
  const snap = buildFiscalSnapshot(tipo, monto, tasa, acredita);
  return {
    ...snap,
    subtotal: roundMoney(snap.subtotal),
    iva: roundMoney(snap.iva),
    iva_trasladado: roundMoney(snap.iva_trasladado),
    iva_acreditable: roundMoney(snap.iva_acreditable),
  };
}
