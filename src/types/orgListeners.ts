/**
 * Documentos mínimos leídos por listeners de org (H3).
 * Campos alineados al uso real en App — no inventar schema completo.
 */

import type { TransactionDoc } from './transaction';

/** Transacción en snapshot (id siempre presente). */
export type TransactionListenerDoc = TransactionDoc & { id: string };

export type ProductDoc = {
  id: string;
  codigo?: string;
  descripcion?: string;
  unidad?: string;
  organization_id?: string;
  usuario_id?: string;
};

export type InventoryMovementDoc = {
  id: string;
  product_id?: string;
  tipo?: string;
  cantidad?: number | string;
  costo_unitario?: number | string;
  fecha?: string;
  nota?: string;
  organization_id?: string;
  usuario_id?: string;
};

export type RecurringTransactionDoc = {
  id: string;
  organization_id?: string;
  concepto?: string;
  monto?: number;
  tipo?: string;
  moneda?: string;
  frecuencia?: string;
  proxima_ejecucion?: string;
  condicion_fin?: string;
  activa?: boolean;
  deleted?: boolean;
  ocurrencias_completadas?: number;
  usuario_id?: string;
};

/** Timestamp Firestore o valor ya resuelto. */
export type FirestoreTimestampLike = {
  toDate: () => Date;
};

export type AuditListenerDoc = {
  id: string;
  accion?: string;
  recurso?: string;
  detalles?: unknown;
  firma_hash?: string;
  timestamp?: FirestoreTimestampLike | Date | string | null;
  usuario_id?: string;
  provider?: 'groq' | 'gemini';
  modelUsed?: string;
  tokensUsed?: number;
};

export type MonthlyReportSummary = {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  categories: Record<string, { income: number; expense: number }>;
  monthName: string;
  empresaNombre: string;
  empresaRfc: string;
};
