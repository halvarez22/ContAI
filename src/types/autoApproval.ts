/** E24 — selección de aprobación por confianza. Sin escrituras. */

export const AUTO_APPROVAL_AUDIT = 'APROBACION_AUTO_CONFIDENCE_EJECUTADA';

export const AUTO_APPROVAL_ENTRY_REASON = 'Asiento no cuadra';

export const AUTO_APPROVAL_CONFIDENCE_REASON = 'Confianza por debajo del umbral';

export const AUTO_APPROVAL_INVALID_DATE = 'Fecha inválida.';

export interface AutoApprovalCandidate {
  id: string;
  confidence_score: number;
  hasValidEntry: boolean;
  isInClosedPeriod: boolean;
}

export interface AutoApprovalRejection {
  id: string;
  reason: string;
}

export interface AutoApprovalResult {
  approvedCount: number;
  rejectedCount: number;
  rejected: AutoApprovalRejection[];
}

export interface AutoApprovalSelection {
  result: AutoApprovalResult;
  approved: AutoApprovalCandidate[];
}

export interface AutoApprovalTransaction {
  id: string;
  fecha: string;
  status?: string | null;
  confidence_score?: number | null;
  asiento_devengo?: unknown;
  asiento_liquidacion?: unknown;
  is_nomina?: boolean;
  cfdi_tipo_comprobante?: string | null;
}

export interface AutoApprovalFields {
  status: 'conciliado';
  aprobado_por: 'auto_confidence';
}
