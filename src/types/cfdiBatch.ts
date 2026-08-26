/**
 * Contratos tipados para importación batch de CFDI (E4.2 + E9.2 F2).
 * Sin any.
 */

import type { PagoExtracted } from '../lib/cfdiPagosParser';
import type { TransactionSatPaymentFields } from './transactionSat';

export type CfdiImportPhase =
  | 'idle'
  | 'uploading'
  | 'processing_ai'
  | 'success'
  | 'error';

export interface CfdiBatchFileResult {
  fileName: string;
  ok: boolean;
  documentId?: string;
  error?: string;
  /** E9.2 — complemento P ligado automáticamente */
  paymentsLinked?: number;
  /** E9.2 — requiere panel de revisión humana */
  paymentPendingReview?: boolean;
}

export interface CfdiBatchProgress {
  phase: CfdiImportPhase;
  /** Archivos procesados en la fase actual (1-based display friendly via current/total) */
  current: number;
  total: number;
  fileName?: string;
  message?: string;
}

/** Borrador listo para writeBatch (status pendiente). */
export interface CfdiTransactionDraft {
  fileName: string;
  payload: {
    organization_id: string;
    usuario_id: string;
    tipo: 'ingreso' | 'egreso';
    monto: number;
    moneda: string;
    concepto: string;
    proveedor: string;
    fecha: string;
    status: 'pendiente';
    account_name: string;
    tags: string[];
    iva_tasa: string;
    egreso_acredita_iva: boolean;
    deducible: boolean;
    fiscal_subtotal: number;
    fiscal_iva: number;
    rfc_contraparte?: string;
    uso_cfdi?: string;
    forma_pago_sat?: string;
    metodo_pago_sat?: string;
    cp_expedicion?: string;
    cfdi_uuid?: string;
    importado_cfdi: true;
    source_file_name: string;
    /** E13.1 */
    is_nomina?: boolean;
    nomina_isr_retained?: number;
    nomina_imss_retained?: number;
    nomina_total_percepciones?: number;
    nomina_total_deducciones?: number;
    account_source?: string;
  } & TransactionSatPaymentFields;
  classification: {
    tipo: string;
    monto: number;
    concepto: string;
    proveedor: string;
    fecha: string;
    moneda: string;
  };
  /** false para complemento tipo P (sin Groq clasificador). */
  requiresGroqClassification: boolean;
  /** Datos Pagos 2.0 para post-proceso (solo tipo P). */
  paymentPagos?: PagoExtracted[];
}

export interface CfdiBatchImportSummary {
  results: CfdiBatchFileResult[];
  committed: number;
  classified: number;
  skippedClosed: number;
  failed: number;
  /** E9.2 — aplicaciones de pago creadas desde complementos P */
  paymentsLinked?: number;
  paymentsPendingReview?: number;
}

/** Payload tipado para clasificación tras importar CFDI (sin any). */
export interface CfdiClassificationPayload {
  tipo: string;
  monto: number;
  concepto: string;
  proveedor: string;
  fecha: string;
  moneda: string;
}
