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
