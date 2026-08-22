/**
 * Contratos tipados para conciliación bancaria (E5.1).
 * Sin any.
 */

export interface ParsedBankRow {
  fecha: string;
  monto: number;
  descripcion: string;
}

/** Subset del libro necesario para matching heurístico. */
export interface BankLedgerItem {
  id: string;
  monto: number;
  fecha: string;
  concepto?: string;
}

export interface BankMatchSuggestion {
  bankRowIndex: number;
  transactionId: string | null;
  score: number;
  note: string;
  /** true si más de una fila bancaria apunta a la misma tx — no auto-confirmar */
  isConflict: boolean;
}

export interface BankReconcileConfirm {
  bankRowIndex: number;
  transactionId: string;
  score: number;
  bankDescription: string;
}

export interface BankConfirmSummary {
  confirmed: number;
  skippedConflict: number;
  skippedNoMatch: number;
  errors: string[];
}

export const BANK_MATCH_AMOUNT_TOLERANCE_PCT = 2;
export const BANK_MATCH_MAX_DAYS_DIFF = 4;
export const BANK_MATCH_DESC_MAX_LEN = 255;
