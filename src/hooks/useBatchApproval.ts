/**
 * Cola de revisión (E18). El cálculo es puro; aquí solo se filtra, se guarda y se audita.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CatalogAccount } from '../types/chartOfAccounts';
import type {
  AccountReassignmentPatch,
  ApprovalStatusPatch,
  BatchApprovalResult,
  BatchApprovalTransaction,
} from '../types/batchApproval';
import {
  AUDIT_APROBACION_LOTE_EJECUTADA,
  AUDIT_CUENTA_REASIGNADA,
} from '../types/batchApproval';
import { periodKey } from '../lib/periodClose';
import { logAuditEntry } from '../services/auditService';
import {
  planAccountReassignment,
  planBatchApproval,
} from '../services/batchApprovalService';
import {
  BATCH_CHUNK,
  commitTransactionUpdatesBatch,
  serverTimestamp,
} from '../services/firestoreService';

export type ReviewSource = {
  id: string;
  fecha: string;
  status?: string | null;
  organization_id?: string;
  tipo?: string;
  monto?: number | string;
  fiscal_subtotal?: number;
  fiscal_iva?: number;
  account_code?: string;
  account_name?: string | null;
  metodo_pago_sat?: string;
  concepto?: string | null;
  proveedor?: string | null;
  is_nomina?: boolean;
  policy_review_reason?: string | null;
};

function inSelectedMonth(fecha: string, year: number, monthIndex: number): boolean {
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getFullYear() === year && parsed.getMonth() === monthIndex;
}

function toQueueRow(tx: ReviewSource): BatchApprovalTransaction {
  const monto = typeof tx.monto === 'number' ? tx.monto : Number(tx.monto);
  return {
    id: tx.id,
    fecha: tx.fecha,
    status: tx.status ?? undefined,
    organization_id: tx.organization_id,
    tipo: tx.tipo,
    monto: Number.isFinite(monto) ? monto : undefined,
    fiscal_subtotal: tx.fiscal_subtotal,
    fiscal_iva: tx.fiscal_iva,
    account_code: tx.account_code,
    account_name: tx.account_name ?? undefined,
    metodo_pago_sat: tx.metodo_pago_sat,
    concepto: tx.concepto ?? undefined,
    proveedor: tx.proveedor ?? undefined,
    is_nomina: tx.is_nomina,
    policy_review_reason: tx.policy_review_reason,
  };
}

function approvalPayload(patch: ApprovalStatusPatch) {
  if (patch.status === 'conciliado') {
    return {
      status: patch.status,
      actualizado_en: serverTimestamp(),
      aprobado_en: serverTimestamp(),
      ...(patch.aprobado_por ? { aprobado_por: patch.aprobado_por } : {}),
    };
  }
  return {
    status: patch.status,
    actualizado_en: serverTimestamp(),
    rechazado_en: serverTimestamp(),
    motivo_rechazo: patch.motivo_rechazo ?? '',
    ...(patch.rechazado_por ? { rechazado_por: patch.rechazado_por } : {}),
  };
}

function accountPayload(patch: AccountReassignmentPatch) {
  return {
    account_code: patch.account_code,
    account_name: patch.account_name,
    account_source: patch.account_source,
    asiento_devengo: patch.asiento_devengo,
    actualizado_en: serverTimestamp(),
  };
}

async function commitChunks(
  updates: Array<{ id: string; payload: ReturnType<typeof approvalPayload> | ReturnType<typeof accountPayload> }>
): Promise<{ committed: number; errors: BatchApprovalResult['errors'] }> {
  const errors: BatchApprovalResult['errors'] = [];
  let committed = 0;
  for (let index = 0; index < updates.length; index += BATCH_CHUNK) {
    const chunk = updates.slice(index, index + BATCH_CHUNK);
    try {
      await commitTransactionUpdatesBatch(chunk);
      committed += chunk.length;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'No se pudo guardar el bloque.';
      for (const item of chunk) errors.push({ id: item.id, reason });
    }
  }
  return { committed, errors };
}

export function useBatchApproval(input: {
  transactions: readonly ReviewSource[];
  chart: readonly CatalogAccount[];
  year: number;
  monthIndex: number;
  organizationId?: string;
  periodosCerrados: readonly string[];
  canWrite: boolean;
  atajoPueBancos: boolean;
  actorLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const queue = useMemo(() => {
    const rows: BatchApprovalTransaction[] = [];
    for (const tx of input.transactions) {
      if (tx.status !== 'revisión') continue;
      if (!inSelectedMonth(tx.fecha, input.year, input.monthIndex)) continue;
      rows.push(toQueueRow(tx));
    }
    return rows;
  }, [input.transactions, input.year, input.monthIndex]);

  const run = useCallback(
    async (action: 'approve' | 'reject', ids: readonly string[], reason?: string): Promise<BatchApprovalResult> => {
      if (busyRef.current) {
        return { successCount: 0, failedCount: 0, errors: [] };
      }
      if (!input.canWrite || !input.organizationId) {
        return {
          successCount: 0,
          failedCount: ids.length,
          errors: ids.map((id) => ({
            id,
            reason: input.canWrite ? 'Elige una organización.' : 'Tu rol no puede aprobar movimientos.',
          })),
        };
      }
      const planned = planBatchApproval({
        action,
        ids,
        transactions: queue,
        periodosCerrados: input.periodosCerrados,
        reason,
        actorLabel: input.actorLabel,
        organizationId: input.organizationId,
      });
      busyRef.current = true;
      setBusy(true);
      try {
        const saved = await commitChunks(
          planned.patches.map((patch) => ({ id: patch.id, payload: approvalPayload(patch) }))
        );
        const errors = [...planned.result.errors, ...saved.errors];
        const result: BatchApprovalResult = {
          successCount: saved.committed,
          failedCount: errors.length,
          errors,
        };
        await logAuditEntry(AUDIT_APROBACION_LOTE_EJECUTADA, 'transactions', {
          organization_id: input.organizationId,
          periodKey: periodKey(input.year, input.monthIndex),
          action,
          affected_count: result.successCount,
          ...(action === 'reject' ? { reason: reason?.trim() ?? '' } : {}),
        });
        return result;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [input, queue]
  );

  const reassign = useCallback(
    async (id: string, accountCode: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (busyRef.current) return { ok: false, reason: 'Espera a que termine el guardado.' };
      if (!input.canWrite) return { ok: false, reason: 'Tu rol no puede aprobar movimientos.' };
      if (!input.organizationId) return { ok: false, reason: 'Elige una organización.' };
      let target: BatchApprovalTransaction | undefined;
      for (const row of queue) {
        if (row.id === id) target = row;
      }
      if (!target) return { ok: false, reason: 'No está en revisión' };
      const planned = planAccountReassignment({
        transaction: target,
        chart: input.chart,
        accountCode,
        atajoPueBancos: input.atajoPueBancos,
        periodosCerrados: input.periodosCerrados,
      });
      if (planned.ok === false) return planned;
      busyRef.current = true;
      setBusy(true);
      try {
        const saved = await commitChunks([
          { id: planned.patch.id, payload: accountPayload(planned.patch) },
        ]);
        if (saved.committed !== 1) {
          return { ok: false, reason: saved.errors[0]?.reason ?? 'No se pudo guardar la cuenta.' };
        }
        await logAuditEntry(AUDIT_CUENTA_REASIGNADA, 'transactions', {
          organization_id: input.organizationId,
          periodKey: periodKey(input.year, input.monthIndex),
          account_code: planned.patch.account_code,
          affected_count: 1,
        });
        return { ok: true };
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [input, queue]
  );

  return { queue, busy, run, reassign };
}
