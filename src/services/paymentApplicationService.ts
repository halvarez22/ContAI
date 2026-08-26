/**
 * Persistencia canónica de payment_applications (E9.2 F3).
 * Validación + writeBatch atómico (apps + patches TX) + audit.
 */

import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { logAuditEntry } from './auditService';
import { hasPaymentApplicationsForSource } from './firestoreService';
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
  type PaymentApplicationSourceType,
  type PaymentStatus,
} from '../types/paymentApplication';

const PAYMENT_APPLICATIONS = 'payment_applications';

export type PaymentApplicationTargetSnapshot = {
  transactionId: string;
  organizationId: string;
  montoOriginal: number;
  saldoPendiente: number;
  appliedPaymentAmount: number;
  fecha: string;
};

export type ConfirmPaymentApplicationsInput = {
  organizationId: string;
  userId: string;
  sourceType: PaymentApplicationSourceType;
  sourceId: string;
  sourceAmount: number;
  applications: PaymentApplicationDraft[];
  targets: PaymentApplicationTargetSnapshot[];
  paymentTransactionId?: string;
  periodosCerrados?: readonly string[];
  cfdiUuidByTargetId?: Record<string, string>;
};

export type ConfirmPaymentApplicationsResult =
  | { status: 'confirmed'; applicationCount: number; applicationIds: string[] }
  | { status: 'already_processed' }
  | { status: 'validation_error'; error: string }
  | { status: 'closed_period'; error: string };

export type PaymentApplicationsBatchWrite = {
  organizationId: string;
  userId: string;
  sourceType: PaymentApplicationSourceType;
  sourceId: string;
  paymentTransactionId?: string;
  applications: Array<{
    targetTransactionId: string;
    amount: number;
    cfdiUuidRelacionado?: string;
  }>;
  targetUpdates: Array<{
    transactionId: string;
    montoOriginal: number;
    appliedPaymentAmount: number;
    saldoPendiente: number;
    paymentStatus: PaymentStatus;
  }>;
};

export type PaymentApplicationPersistence = {
  hasApplicationsForSource: (
    organizationId: string,
    sourceId: string
  ) => Promise<boolean>;
  writeApplicationsBatch: (
    payload: PaymentApplicationsBatchWrite
  ) => Promise<{ applicationIds: string[] }>;
};

function targetMap(
  targets: readonly PaymentApplicationTargetSnapshot[]
): Map<string, PaymentApplicationTargetSnapshot> {
  return new Map(targets.map((t) => [t.transactionId, t]));
}

export function buildPaymentTargetUpdates(
  targets: readonly PaymentApplicationTargetSnapshot[],
  applications: readonly PaymentApplicationDraft[]
): Array<{
  transactionId: string;
  montoOriginal: number;
  appliedPaymentAmount: number;
  saldoPendiente: number;
  paymentStatus: PaymentStatus;
}> {
  const byId = targetMap(targets);
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
    montoOriginal: number;
    appliedPaymentAmount: number;
    saldoPendiente: number;
    paymentStatus: PaymentStatus;
  }> = [];

  for (const [txId, delta] of appliedByTx) {
    const target = byId.get(txId);
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

export function validatePaymentApplicationsInput(
  input: ConfirmPaymentApplicationsInput
):
  | { ok: true; normalized: PaymentApplicationDraft[] }
  | { ok: false; status: 'validation_error' | 'closed_period'; error: string } {
  if (!input.organizationId.trim()) {
    return { ok: false, status: 'validation_error', error: 'organizationId requerido' };
  }

  const sumCheck = assertValidPaymentApplications({
    sourceAmount: input.sourceAmount,
    applications: input.applications,
  });
  if (sumCheck.ok === false) {
    return { ok: false, status: 'validation_error', error: sumCheck.error };
  }

  const normalized = input.applications.map((a) => ({
    targetTransactionId: a.targetTransactionId,
    amount: roundMoney(a.amount),
  }));

  const byTarget = targetMap(input.targets);

  for (const target of input.targets) {
    if (target.organizationId !== input.organizationId) {
      return {
        ok: false,
        status: 'validation_error',
        error: `organization_id inconsistente en TX ${target.transactionId}`,
      };
    }
  }

  for (const app of normalized) {
    const target = byTarget.get(app.targetTransactionId);
    if (!target) {
      return {
        ok: false,
        status: 'validation_error',
        error: `Factura destino desconocida: ${app.targetTransactionId}`,
      };
    }
    if (target.organizationId !== input.organizationId) {
      return {
        ok: false,
        status: 'validation_error',
        error: `TX ${app.targetTransactionId} no pertenece a la organización`,
      };
    }
    if (
      input.periodosCerrados &&
      isTransactionDateInClosedPeriod(target.fecha, [...input.periodosCerrados])
    ) {
      return {
        ok: false,
        status: 'closed_period',
        error: `Factura en periodo cerrado: ${app.targetTransactionId}`,
      };
    }
    const saldoCheck = assertApplicationWithinSaldo({
      targetTransactionId: app.targetTransactionId,
      amount: app.amount,
      saldoPendiente: target.saldoPendiente,
    });
    if (saldoCheck.ok === false) {
      return { ok: false, status: 'validation_error', error: saldoCheck.error };
    }
  }

  return { ok: true, normalized };
}

export async function writePaymentApplicationsBatchToFirestore(
  payload: PaymentApplicationsBatchWrite
): Promise<{ applicationIds: string[] }> {
  const batch = writeBatch(db);
  const applicationIds: string[] = [];

  for (const app of payload.applications) {
    const ref = doc(collection(db, PAYMENT_APPLICATIONS));
    applicationIds.push(ref.id);
    batch.set(ref, {
      organization_id: payload.organizationId,
      usuario_id: payload.userId,
      source_type: payload.sourceType,
      source_id: payload.sourceId,
      ...(payload.paymentTransactionId
        ? { payment_transaction_id: payload.paymentTransactionId }
        : {}),
      target_transaction_id: app.targetTransactionId,
      amount: app.amount,
      ...(app.cfdiUuidRelacionado
        ? { cfdi_uuid_relacionado: app.cfdiUuidRelacionado }
        : {}),
      creado_en: serverTimestamp(),
    });
  }

  for (const u of payload.targetUpdates) {
    batch.set(
      doc(db, 'transactions', u.transactionId),
      {
        organization_id: payload.organizationId,
        monto_original: u.montoOriginal,
        applied_payment_amount: u.appliedPaymentAmount,
        saldo_pendiente: u.saldoPendiente,
        payment_status: u.paymentStatus,
        actualizado_en: serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
  return { applicationIds };
}

export const defaultPaymentApplicationPersistence: PaymentApplicationPersistence =
  {
    hasApplicationsForSource: hasPaymentApplicationsForSource,
    writeApplicationsBatch: writePaymentApplicationsBatchToFirestore,
  };

export async function confirmPaymentApplications(
  input: ConfirmPaymentApplicationsInput,
  persistence: PaymentApplicationPersistence = defaultPaymentApplicationPersistence
): Promise<ConfirmPaymentApplicationsResult> {
  const already = await persistence.hasApplicationsForSource(
    input.organizationId,
    input.sourceId
  );
  if (already) {
    return { status: 'already_processed' };
  }

  const validated = validatePaymentApplicationsInput(input);
  if (validated.ok === false) {
    return { status: validated.status, error: validated.error };
  }

  const normalized = validated.normalized;
  const targetUpdates = buildPaymentTargetUpdates(input.targets, normalized);

  const batchPayload: PaymentApplicationsBatchWrite = {
    organizationId: input.organizationId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    paymentTransactionId: input.paymentTransactionId,
    applications: normalized.map((a) => ({
      targetTransactionId: a.targetTransactionId,
      amount: a.amount,
      cfdiUuidRelacionado: input.cfdiUuidByTargetId?.[a.targetTransactionId],
    })),
    targetUpdates,
  };

  const { applicationIds } =
    await persistence.writeApplicationsBatch(batchPayload);

  await logAuditEntry(AUDIT_PAYMENT_APPLICATION_CONFIRMED, 'payment_applications', {
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    paymentTxId: input.paymentTransactionId,
    applicationsCount: normalized.length,
    sum: sumPaymentAmounts(normalized),
    organization_id: input.organizationId,
    applicationIds,
  });

  return {
    status: 'confirmed',
    applicationCount: normalized.length,
    applicationIds,
  };
}
