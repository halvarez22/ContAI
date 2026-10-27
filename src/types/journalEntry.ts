/**
 * Asiento de devengo (E16). Sin RFC ni nombre de contraparte.
 */

export const AUDIT_POLIZA_DEVENGO_GENERADA = 'POLIZA_DEVENGO_GENERADA';

export const ATAJO_PUE_CONCEPTO = 'Aplicado atajo PUE a Bancos';

export const POLIZA_DEVENGO_DISABLED_HINT =
  'No hay asientos de devengo en este periodo.';

export type JournalLineTipo = 'cargo' | 'abono';

export type JournalLine = {
  account_code: string;
  account_name: string;
  tipo: JournalLineTipo;
  monto: number;
  concepto: string;
};

export type JournalEntry = {
  transaction_id: string;
  tipo: 'ingreso' | 'egreso';
  fecha: string;
  atajo_pue_bancos: boolean;
  lines: JournalLine[];
};

export type AccrualOk = { ok: true; entry: JournalEntry };
export type AccrualFail = { ok: false; reason: string };
export type AccrualResult = AccrualOk | AccrualFail;

/** Importes de nómina. En la rama `is_nomina` los tres son obligatorios. */
export type NominaAccrualAmounts = {
  total_percepciones: number;
  isr_retained: number;
  imss_retained: number;
};

export const AUDIT_ASIENTO_LIQUIDACION_GENERADO = 'ASIENTO_LIQUIDACION_GENERADO';
export const LIQUIDACION_LINE_CONCEPTO = 'Liquidación';
export const LIQUIDACION_MONEDA_REASON = 'Moneda distinta de MXN en complemento de pago';
export const LIQUIDACION_RFC_REASON = 'No se pudo determinar si es cobro o pago';
export const LIQUIDACION_REASSIGN_BLOCKED =
  'La liquidación del complemento de pago no puede reclasificarse a una cuenta de resultados';

export type LiquidationOperation = 'cobro' | 'pago';

export type LiquidationDraft = {
  id: string;
  monto_total: number;
  tipo_operacion: LiquidationOperation;
  account_code: string;
  fecha: string | Date;
  moneda: string;
};
