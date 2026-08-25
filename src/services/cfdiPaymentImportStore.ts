/**
 * Adaptador Firestore para PaymentImportStore (E9.2 F2).
 */

import { logAuditEntry } from './auditService';
import {
  commitPaymentApplicationsBatch,
  findTransactionsByCfdiUuids,
  hasPaymentApplicationsForSource,
} from './firestoreService';
import type {
  PaymentImportStore,
  ResolvedInvoiceTarget,
} from './cfdiPaymentImportService';
import { computeSaldoPendiente, roundMoney } from '../types/paymentApplication';

export function createFirestorePaymentImportStore(): PaymentImportStore {
  return {
    hasApplicationsForSource: hasPaymentApplicationsForSource,
    async resolveInvoicesByCfdiUuid(organizationId, uuids) {
      const rows = await findTransactionsByCfdiUuids(organizationId, uuids);
      const out = new Map<string, ResolvedInvoiceTarget>();
      for (const [uuid, row] of rows) {
        const montoOriginal = roundMoney(row.monto_original ?? row.monto);
        const applied = roundMoney(row.applied_payment_amount ?? 0);
        out.set(uuid, {
          transactionId: row.id,
          cfdiUuid: uuid,
          fecha: row.fecha,
          montoOriginal,
          appliedPaymentAmount: applied,
          saldoPendiente:
          row.saldo_pendiente !== undefined
            ? roundMoney(row.saldo_pendiente)
            : computeSaldoPendiente(montoOriginal, applied),
        });
      }
      return out;
    },
    commitPaymentApplications: commitPaymentApplicationsBatch,
    logAudit: (action, resource, details) =>
      logAuditEntry(action, resource, details),
  };
}
