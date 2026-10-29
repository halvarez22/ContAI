/**
 * Borrador para reconstruir un asiento que falta (E21).
 * Solo campos de la transacción. Sin XML y sin RFC.
 */

import type { JournalEntry } from './journalEntry';

export interface HistoricalReconstructionDraft {
  id: string;
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  concepto: string;
  proveedor: string;
  moneda: string;
  fiscal_subtotal: number | null;
  fiscal_iva: number | null;
  is_nomina: boolean;
  total_percepciones: number | null;
  isr_retained: number | null;
  imss_retained: number | null;
  cfdi_tipo_comprobante?: string;
  account_code: string | null;
  account_name: string | null;
  metodo_pago_sat?: string;
  asiento_devengo?: unknown;
  asiento_liquidacion?: unknown;
}

export type MissingJournalPatch = {
  id: string;
  payload: {
    status?: 'revisión';
    policy_review_reason?: string;
    asiento_devengo?: JournalEntry;
    account_code?: string;
    account_name?: string;
    account_source?: string;
  };
};

export type MissingJournalPlan = {
  updates: MissingJournalPatch[];
  generated: number;
  review: number;
  omitted: number;
  notices: string[];
  reasons: string[];
};
