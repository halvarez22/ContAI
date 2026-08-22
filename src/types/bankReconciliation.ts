/**
 * Contratos tipados para conciliación bancaria (E5.1 + E5.2).
 * Sin any.
 */

export interface ParsedBankRow {
  fecha: string;
  monto: number;
  descripcion: string;
}

/** Subset del libro necesario para matching. */
export interface BankLedgerItem {
  id: string;
  monto: number;
  fecha: string;
  concepto?: string;
}

export type BankSuggestionSource = 'heuristic' | 'ai';

export interface BankMatchSuggestion {
  bankRowIndex: number;
  transactionId: string | null;
  score: number;
  note: string;
  /** true si match ambiguo o varias filas → misma tx — no auto-confirmar */
  isConflict: boolean;
  suggestionSource?: BankSuggestionSource;
}

/** Propuesta tipada de Groq Conciliador (E5.2). */
export interface BankAiMatchProposal {
  matchedTransactionId: string | null;
  /** 0–1 */
  confidence_score: number;
  reason: string;
  requires_human_approval: boolean;
}

export interface BankAiMatchInput {
  bankRow: ParsedBankRow;
  candidates: BankLedgerItem[];
}

export type ProposeBankMatchFn = (
  input: BankAiMatchInput
) => Promise<{
  proposal: BankAiMatchProposal;
  modelUsed: string;
  tokensUsed?: number;
}>;

export interface BankAiEnrichSummary {
  enriched: number;
  attempted: number;
  /** Errores por índice de fila bancaria (fallos parciales). */
  errorByRowIndex: Record<number, string>;
  suggestions: BankMatchSuggestion[];
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

/** Score heurístico 0–100 por debajo del cual la fila es elegible para Groq (E5.2). */
export const BANK_AI_LOW_SCORE_THRESHOLD = 70;

/** Diferencia mínima entre 1.º y 2.º candidato; si menor → conflicto de ambigüedad. */
export const BANK_MATCH_AMBIGUOUS_SCORE_DELTA = 5;

/** Candidatos máximos enviados a Groq por fila. */
export const BANK_AI_MAX_CANDIDATES = 8;
