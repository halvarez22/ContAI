/**
 * Contrato del previo fiscal informativo (ContAI Fase 1).
 */

export interface TaxAmountByRate {
  subtotal: number;
  iva: number;
}

export interface TaxPreviewIva {
  trasladado: number;
  acreditable: number;
  saldoNeto: number;
  porTasaIngreso: Record<string, TaxAmountByRate>;
  porTasaEgresoAcreditable: Record<string, TaxAmountByRate>;
  lineasSinDesglose: number;
}

export interface TaxPreviewIsr {
  ingresosAcumulablesYtd: number;
  deduccionesYtd: number;
  baseGravableYtd: number;
  isrEstimado: number;
  detalleTramo: string;
  mesAplicado: number;
  nota: string;
}

export interface TaxPreview {
  periodoLabel: string;
  year: number;
  monthIndex: number;
  iva: TaxPreviewIva;
  isr: TaxPreviewIsr;
  warnings: string[];
  disclaimer: string;
}

/** Campos mínimos de una TX para cálculo fiscal (sin any). */
export interface TaxTransactionInput {
  tipo: string;
  monto: number | string;
  iva_tasa?: string | number | null;
  egreso_acredita_iva?: boolean | string | null;
  deducible?: boolean | null;
}

export interface TaxPreviewInput {
  monthTransactions: TaxTransactionInput[];
  ytdTransactions: TaxTransactionInput[];
  year: number;
  monthIndex: number;
}

export interface GroqTaxHints {
  tax_deductible?: boolean;
  notes?: string;
}
