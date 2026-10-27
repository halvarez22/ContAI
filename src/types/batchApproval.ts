/**
 * Aprobación en lote (E18). El estado aprobado no existe:
 * aprobar es `conciliado` y rechazar es `rechazado`.
 */

import type { JournalEntry } from './journalEntry';

export const AUDIT_APROBACION_LOTE_EJECUTADA = 'APROBACION_LOTE_EJECUTADA';
export const AUDIT_CUENTA_REASIGNADA = 'CUENTA_REASIGNADA';

export const CLOSED_PERIOD_REASON = 'Periodo cerrado';
export const NOT_IN_REVIEW_REASON = 'No está en revisión';
export const MISSING_REJECT_REASON = 'Escribe un motivo de rechazo.';
export const REJECT_REASON_TOO_LONG = 'El motivo supera 200 caracteres.';
export const ACCOUNT_NOT_IN_CHART = 'La cuenta no está en el catálogo activo.';
export const REJECT_REASON_MAX = 200;

export type BatchApprovalAction = 'approve' | 'reject';

export type BatchApprovalError = {
  id: string;
  reason: string;
};

export type BatchApprovalResult = {
  successCount: number;
  failedCount: number;
  errors: BatchApprovalError[];
};

export type BatchApprovalTransaction = {
  id: string;
  fecha: string;
  status?: string;
  organization_id?: string;
  tipo?: string;
  monto?: number;
  fiscal_subtotal?: number;
  fiscal_iva?: number;
  account_code?: string;
  account_name?: string;
  metodo_pago_sat?: string;
  concepto?: string;
  proveedor?: string;
  is_nomina?: boolean;
  policy_review_reason?: string | null;
};

export type ApprovalStatusPatch = {
  id: string;
  status: 'conciliado' | 'rechazado';
  aprobado_por?: string;
  motivo_rechazo?: string;
  rechazado_por?: string;
};

export type AccountReassignmentPatch = {
  id: string;
  account_code: string;
  account_name: string;
  account_source: 'manual';
  asiento_devengo: JournalEntry;
};

export type BatchApprovalPlan = {
  patches: ApprovalStatusPatch[];
  result: BatchApprovalResult;
};
