import type { CatalogAccount } from './chartOfAccounts';
import type { JournalEntry } from './journalEntry';

export const AUDIT_RECLASIFICACION_CONCILIADO = 'RECLASIFICACION_CONCILIADO_EJECUTADA';

export const RECLASS_PERMISSION_REASON =
  'Solo el dueño o un administrador puede reclasificar un movimiento conciliado.';

export const RECLASS_NOT_CONCILIADO = 'El movimiento no está conciliado.';

export const RECLASS_SAME_ACCOUNT = 'El movimiento ya tiene esa cuenta.';

export const RECLASS_REVIEW_REASON =
  'Reclasificado desde un movimiento conciliado. Requiere una nueva aprobación.';

export const RECLASS_CONFIRM_LABEL =
  'Entiendo que esto modificará un movimiento ya conciliado';

export interface ReconciledReassignmentRequest {
  transaction_id: string;
  fecha: string;
  status?: string | null;
  tipo: string;
  monto: number;
  fiscal_subtotal?: number | null;
  fiscal_iva?: number | null;
  account_code?: string | null;
  new_account_code: string;
  metodo_pago_sat?: string | null;
  concepto?: string | null;
  proveedor?: string | null;
  is_nomina?: boolean;
  cfdi_tipo_comprobante?: string | null;
  confidence_score?: number | null;
  canManage: boolean;
  atajoPueBancos: boolean;
  periodosCerrados: readonly string[];
  chart: readonly CatalogAccount[];
}

export interface ReconciledReassignmentPatch {
  status: 'revisión';
  account_code: string;
  account_name: string;
  account_source: 'manual';
  asiento_devengo: JournalEntry;
  policy_review_reason: string;
}

export type ReconciledReassignmentResult =
  | { ok: true; patch: ReconciledReassignmentPatch }
  | { ok: false; reason: string };
