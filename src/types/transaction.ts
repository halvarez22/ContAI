/**
 * Tipos de documento de transacción en Firestore (ContAI).
 * Campos alineados al schema existente — no renombrar.
 */

import type { IvaTasaCode } from '../lib/fiscal';

export type TransactionTipo = 'ingreso' | 'egreso';

export type TransactionStatus =
  | 'pendiente'
  | 'revisión'
  | 'conciliado'
  | 'rechazado'
  | string;

export interface TransactionFiscalFields {
  iva_tasa?: IvaTasaCode | number;
  egreso_acredita_iva?: boolean;
  deducible?: boolean;
  fiscal_subtotal?: number;
  fiscal_iva?: number;
  rfc_contraparte?: string;
  uso_cfdi?: string;
  forma_pago_sat?: string;
  metodo_pago_sat?: string;
  cp_expedicion?: string;
  cfdi_uuid?: string;
  importado_cfdi?: boolean;
}

/** Documento de transacción tal como se persiste / lee (id opcional en escrituras). */
export interface TransactionDoc extends TransactionFiscalFields {
  id?: string;
  organization_id?: string;
  usuario_id?: string;
  tipo: TransactionTipo | string;
  monto: number;
  moneda?: string;
  concepto: string;
  proveedor?: string;
  fecha: string;
  status?: TransactionStatus;
  account_name?: string;
  account_source?: string;
  tags?: string[];
  agente_ia_decision?: string;
  confidence_score?: number;
  policy_review_reason?: string | null;
  aprobado_por?: string | null;
  aprobado_en?: unknown;
  rechazado_por?: string;
  motivo_rechazo?: string;
  rechazado_en?: unknown;
  actualizado_en?: unknown;
  creado_en?: unknown;
  [key: string]: unknown;
}
