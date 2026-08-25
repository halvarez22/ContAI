/**
 * Campos SAT E9.2 — aplicación de pagos (merge-only en Firestore).
 */

import type { PaymentStatus } from './paymentApplication';

export type CfdiTipoComprobanteSat = 'I' | 'E' | 'P' | 'T' | 'N';

export interface TransactionSatPaymentFields {
  cfdi_tipo_comprobante?: CfdiTipoComprobanteSat;
  es_factura_global?: boolean;
  global_periodicidad?: string;
  global_meses?: string;
  es_anticipo?: boolean;
  monto_original?: number;
  saldo_pendiente?: number;
  payment_status?: PaymentStatus;
  applied_payment_amount?: number;
}
