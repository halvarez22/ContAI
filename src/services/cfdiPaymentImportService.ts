/**
 * Importación complemento P + campos SAT en drafts (E9.2 F2).
 * Sin React. Firestore vía PaymentImportStore inyectable.
 */

import type { PagoExtracted } from '../lib/cfdiPagosParser';
import type { InformacionGlobalExtracted } from '../lib/cfdiPagosParser';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import {
  assertApplicationWithinSaldo,
  assertValidPaymentApplications,
  roundMoney,
  sumPaymentAmounts,
  type PaymentApplicationDraft,
  type PaymentStatus,
} from '../types/paymentApplication';
import type { CfdiTipoComprobanteSat } from '../types/transactionSat';
import {
  confirmPaymentApplications,
  type ConfirmPaymentApplicationsResult,
} from './paymentApplicationService';

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
  resolveInvoicesByCfdiUuid: (
    organizationId: string,
    uuids: readonly string[]
  ) => Promise<Map<string, ResolvedInvoiceTarget>>;
};

export type ConfirmPaymentFn = (
  input: Parameters<typeof confirmPaymentApplications>[0]
) => Promise<ConfirmPaymentApplicationsResult>;

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

export async function processTipoPPaymentImport(params: {
  organizationId: string;
  userId: string;
  paymentTxId: string;
  cfdiUuid: string;
  pagos: PagoExtracted[];
  periodosCerrados: readonly string[];
  store: PaymentImportStore;
  confirmPayment?: ConfirmPaymentFn;
}): Promise<PaymentImportOutcome> {
  if (!params.cfdiUuid) {
    return { status: 'pending_review', reason: 'Complemento P sin UUID' };
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

  const confirm = params.confirmPayment ?? confirmPaymentApplications;
  const cfdiUuidByTargetId: Record<string, string> = {};
  for (const t of resolved.values()) {
    cfdiUuidByTargetId[t.transactionId] = t.cfdiUuid;
  }

  const result = await confirm({
    organizationId: params.organizationId,
    userId: params.userId,
    sourceType: 'cfdi_pago',
    sourceId: params.cfdiUuid,
    sourceAmount: sumTipoPPaymentAmount(params.pagos),
    paymentTransactionId: params.paymentTxId,
    applications: evaluation.applications,
    targets: [...resolved.values()].map((t) => ({
      transactionId: t.transactionId,
      organizationId: params.organizationId,
      montoOriginal: t.montoOriginal,
      saldoPendiente: t.saldoPendiente,
      appliedPaymentAmount: t.appliedPaymentAmount,
      fecha: t.fecha,
    })),
    periodosCerrados: params.periodosCerrados,
    cfdiUuidByTargetId,
  });

  if (result.status === 'already_processed') {
    return { status: 'already_processed' };
  }
  if (
    result.status === 'validation_error' ||
    result.status === 'closed_period'
  ) {
    return { status: 'pending_review', reason: result.error };
  }

  return {
    status: 'applied',
    applicationsCount: result.applicationCount,
  };
}
