/**
 * Importación complemento P + campos SAT en drafts (E9.2 F2).
 * Sin React. Firestore vía PaymentImportStore inyectable.
 */

import type { PagoExtracted } from '../lib/cfdiPagosParser';
import type { InformacionGlobalExtracted } from '../lib/cfdiPagosParser';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import {
  AUDIT_PAYMENT_APPLICATION_CONFIRMED,
  assertApplicationWithinSaldo,
  assertValidPaymentApplications,
  computeSaldoPendiente,
  derivePaymentStatus,
  roundMoney,
  sumPaymentAmounts,
  type PaymentApplicationDraft,
  type PaymentStatus,
} from '../types/paymentApplication';
import type { CfdiTipoComprobanteSat } from '../types/transactionSat';

export type ResolvedInvoiceTarget = {
  transactionId: string;
  cfdiUuid: string;
  fecha: string;
  montoOriginal: number;
  saldoPendiente: number;
  appliedPaymentAmount: number;
};

export type PaymentImportOutcome =
  | { status: 'already_processed' }
  | { status: 'pending_review'; reason: string }
  | { status: 'applied'; applicationsCount: number };

export type PaymentImportStore = {
  hasApplicationsForSource: (
    organizationId: string,
    sourceId: string
  ) => Promise<boolean>;
  resolveInvoicesByCfdiUuid: (
    organizationId: string,
    uuids: readonly string[]
  ) => Promise<Map<string, ResolvedInvoiceTarget>>;
  commitPaymentApplications: (params: {
    organizationId: string;
    userId: string;
    sourceId: string;
    paymentTxId: string;
    applications: Array<
      PaymentApplicationDraft & { cfdiUuidRelacionado: string }
    >;
    targetUpdates: Array<{
      transactionId: string;
      saldoPendiente: number;
      appliedPaymentAmount: number;
      paymentStatus: PaymentStatus;
      montoOriginal: number;
    }>;
  }) => Promise<void>;
  logAudit: (
    action: string,
    resource: string,
    details: Record<string, unknown>
  ) => Promise<void>;
};

export function normalizeCfdiTipo(tc: string): CfdiTipoComprobanteSat {
  const t = (tc || 'I').toUpperCase();
  if (t === 'E' || t === 'P' || t === 'T' || t === 'N') return t;
  return 'I';
}

export function detectEsAnticipo(concepto: string, usoCfdi?: string): boolean {
  if (concepto.toLowerCase().includes('anticipo')) return true;
  if ((usoCfdi || '').toUpperCase() === 'D10') return true;
  return false;
}

export function deriveInvoicePaymentState(metodoPago: string, monto: number): {
  monto_original: number;
  saldo_pendiente: number;
  payment_status: PaymentStatus;
  applied_payment_amount: number;
} {
  const m = roundMoney(monto);
  const isPpd = (metodoPago || '').toUpperCase() === 'PPD';
  if (isPpd) {
    return {
      monto_original: m,
      saldo_pendiente: m,
      payment_status: 'none',
      applied_payment_amount: 0,
    };
  }
  return {
    monto_original: m,
    saldo_pendiente: 0,
    payment_status: 'full',
    applied_payment_amount: m,
  };
}

export function buildGlobalSatFields(
  global?: InformacionGlobalExtracted
): {
  es_factura_global?: boolean;
  global_periodicidad?: string;
  global_meses?: string;
} {
  if (!global) return {};
  return {
    es_factura_global: true,
    global_periodicidad: global.periodicidad || undefined,
    global_meses: global.meses || undefined,
  };
}

export function sumTipoPPaymentAmount(pagos: readonly PagoExtracted[]): number {
  let sum = 0;
  for (const p of pagos) {
    sum = roundMoney(sum + roundMoney(p.monto));
  }
  return sum;
}

export function collectDoctoRelacionados(
  pagos: readonly PagoExtracted[]
): Array<{
  idDocumento: string;
  impPagado: number;
}> {
  const out: Array<{ idDocumento: string; impPagado: number }> = [];
  for (const p of pagos) {
    for (const d of p.documentos) {
      out.push({
        idDocumento: d.idDocumento,
        impPagado: roundMoney(d.impPagado),
      });
    }
  }
  return out;
}

export type AutoApplyEvaluation =
  | { ok: true; applications: PaymentApplicationDraft[]; sourceAmount: number }
  | { ok: false; reason: string };

export function evaluateTipoPAutoApply(params: {
  pagos: readonly PagoExtracted[];
  resolved: Map<string, ResolvedInvoiceTarget>;
  periodosCerrados: readonly string[];
}): AutoApplyEvaluation {
  const docs = collectDoctoRelacionados(params.pagos);
  if (docs.length === 0) {
    return { ok: false, reason: 'Complemento P sin DoctoRelacionado' };
  }
  if (docs.length > 8) {
    return { ok: false, reason: 'Más de 8 documentos relacionados' };
  }

  const applications: PaymentApplicationDraft[] = [];
  const sourceAmount = sumTipoPPaymentAmount(params.pagos);

  for (const doc of docs) {
    const target = params.resolved.get(doc.idDocumento.toLowerCase());
    if (!target) {
      return {
        ok: false,
        reason: `UUID sin factura en org: ${doc.idDocumento}`,
      };
    }
    if (
      isTransactionDateInClosedPeriod(target.fecha, [...params.periodosCerrados])
    ) {
      return {
        ok: false,
        reason: `Factura en periodo cerrado: ${doc.idDocumento}`,
      };
    }
    const saldoCheck = assertApplicationWithinSaldo({
      targetTransactionId: target.transactionId,
      amount: doc.impPagado,
      saldoPendiente: target.saldoPendiente,
    });
    if (saldoCheck.ok === false) {
      return { ok: false, reason: saldoCheck.error };
    }
    applications.push({
      targetTransactionId: target.transactionId,
      amount: doc.impPagado,
    });
  }

  const sumCheck = assertValidPaymentApplications({
    sourceAmount,
    applications,
  });
  if (sumCheck.ok === false) {
    return { ok: false, reason: sumCheck.error };
  }

  return { ok: true, applications, sourceAmount };
}

export function buildTargetUpdatesAfterApply(
  resolved: Map<string, ResolvedInvoiceTarget>,
  applications: readonly PaymentApplicationDraft[]
): Array<{
  transactionId: string;
  saldoPendiente: number;
  appliedPaymentAmount: number;
  paymentStatus: PaymentStatus;
  montoOriginal: number;
}> {
  const appliedByTx = new Map<string, number>();
  for (const app of applications) {
    const prev = appliedByTx.get(app.targetTransactionId) ?? 0;
    appliedByTx.set(
      app.targetTransactionId,
      roundMoney(prev + roundMoney(app.amount))
    );
  }

  const updates: Array<{
    transactionId: string;
    saldoPendiente: number;
    appliedPaymentAmount: number;
    paymentStatus: PaymentStatus;
    montoOriginal: number;
  }> = [];

  for (const [txId, delta] of appliedByTx) {
    let target: ResolvedInvoiceTarget | undefined;
    for (const t of resolved.values()) {
      if (t.transactionId === txId) {
        target = t;
        break;
      }
    }
    if (!target) continue;
    const nextApplied = roundMoney(target.appliedPaymentAmount + delta);
    const montoOriginal = roundMoney(target.montoOriginal);
    updates.push({
      transactionId: txId,
      montoOriginal,
      appliedPaymentAmount: nextApplied,
      saldoPendiente: computeSaldoPendiente(montoOriginal, nextApplied),
      paymentStatus: derivePaymentStatus(montoOriginal, nextApplied),
    });
  }

  return updates;
}

export async function processTipoPPaymentImport(params: {
  organizationId: string;
  userId: string;
  paymentTxId: string;
  cfdiUuid: string;
  pagos: PagoExtracted[];
  periodosCerrados: readonly string[];
  store: PaymentImportStore;
}): Promise<PaymentImportOutcome> {
  if (!params.cfdiUuid) {
    return { status: 'pending_review', reason: 'Complemento P sin UUID' };
  }

  const already = await params.store.hasApplicationsForSource(
    params.organizationId,
    params.cfdiUuid
  );
  if (already) {
    return { status: 'already_processed' };
  }

  const docs = collectDoctoRelacionados(params.pagos);
  const uuids = docs.map((d) => d.idDocumento);
  const resolved = await params.store.resolveInvoicesByCfdiUuid(
    params.organizationId,
    uuids
  );

  const evaluation = evaluateTipoPAutoApply({
    pagos: params.pagos,
    resolved,
    periodosCerrados: params.periodosCerrados,
  });
  if (evaluation.ok === false) {
    return { status: 'pending_review', reason: evaluation.reason };
  }

  const targetUpdates = buildTargetUpdatesAfterApply(
    resolved,
    evaluation.applications
  );

  await params.store.commitPaymentApplications({
    organizationId: params.organizationId,
    userId: params.userId,
    sourceId: params.cfdiUuid,
    paymentTxId: params.paymentTxId,
    applications: evaluation.applications.map((a) => {
      let cfdiUuidRelacionado = '';
      for (const t of resolved.values()) {
        if (t.transactionId === a.targetTransactionId) {
          cfdiUuidRelacionado = t.cfdiUuid;
          break;
        }
      }
      return {
        ...a,
        cfdiUuidRelacionado,
      };
    }),
    targetUpdates,
  });

  await params.store.logAudit(AUDIT_PAYMENT_APPLICATION_CONFIRMED, 'payment_applications', {
    sourceId: params.cfdiUuid,
    paymentTxId: params.paymentTxId,
    applicationsCount: evaluation.applications.length,
    sum: sumPaymentAmounts(evaluation.applications),
    organization_id: params.organizationId,
  });

  return {
    status: 'applied',
    applicationsCount: evaluation.applications.length,
  };
}
