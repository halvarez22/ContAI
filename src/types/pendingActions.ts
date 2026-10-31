/** E23 — tablero de pendientes del mes. Solo lectura. */

export type PendingActionCategory =
  | 'missing_account'
  | 'in_review'
  | 'pending_reconciliation';

export interface PendingActionItem {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  category: PendingActionCategory;
  reason: string;
}

export interface PendingActionsSummary {
  in_review: number;
  missing_account: number;
  pending_reconciliation: number;
  total: number;
}

export interface PendingActionsReport {
  items: PendingActionItem[];
  summary: PendingActionsSummary;
}

/** Entrada estrecha. No es el documento de Firestore. */
export interface PendingActionSource {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  status?: string | null;
  account_code?: string | null;
  bank_reconciled?: boolean;
  bank_reconcile_status?: 'none' | 'partial' | 'full' | null;
  policy_review_reason?: string | null;
}
