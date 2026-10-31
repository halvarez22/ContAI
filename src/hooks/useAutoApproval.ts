import { useCallback, useMemo, useRef, useState } from 'react';
import { periodKey } from '../lib/periodClose';
import { logAuditEntry } from '../services/auditService';
import {
  selectAutoApprovableTransactions,
  toAutoApprovalFields,
} from '../services/autoApprovalService';
import { commitTransactionUpdatesBatch, serverTimestamp } from '../services/firestoreService';
import { AUTO_APPROVAL_AUDIT } from '../types/autoApproval';
import type { AutoApprovalResult, AutoApprovalTransaction } from '../types/autoApproval';

function inSelectedMonth(fecha: string, year: number, monthIndex: number): boolean {
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getFullYear() === year && parsed.getMonth() === monthIndex;
}

export function useAutoApproval(input: {
  transactions: readonly AutoApprovalTransaction[];
  year: number;
  monthIndex: number;
  threshold: number;
  periodosCerrados: readonly string[];
  canWrite: boolean;
  organizationId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const selection = useMemo(() => {
    const monthRows: AutoApprovalTransaction[] = [];
    for (const tx of input.transactions) {
      if (!inSelectedMonth(tx.fecha, input.year, input.monthIndex)) continue;
      monthRows.push(tx);
    }
    return selectAutoApprovableTransactions(monthRows, input.threshold, input.periodosCerrados);
  }, [input.transactions, input.year, input.monthIndex, input.threshold, input.periodosCerrados]);

  const run = useCallback(async (): Promise<
    { ok: true; result: AutoApprovalResult } | { ok: false; message: string }
  > => {
    if (busyRef.current) {
      return { ok: false, message: 'Espera a que termine la aprobación.' };
    }
    if (!input.canWrite || !input.organizationId) {
      return { ok: false, message: 'Tu rol no puede aprobar movimientos.' };
    }
    if (selection.result.approvedCount === 0) {
      return { ok: true, result: selection.result };
    }

    const fields = toAutoApprovalFields();
    busyRef.current = true;
    setBusy(true);
    try {
      await commitTransactionUpdatesBatch(
        selection.approved.map((row) => ({
          id: row.id,
          payload: {
            status: fields.status,
            aprobado_por: fields.aprobado_por,
            aprobado_en: serverTimestamp(),
            actualizado_en: serverTimestamp(),
          },
        }))
      );
      await logAuditEntry(AUTO_APPROVAL_AUDIT, 'transactions', {
        organization_id: input.organizationId,
        periodKey: periodKey(input.year, input.monthIndex),
        threshold: input.threshold,
        approved_count: selection.result.approvedCount,
      });
      return { ok: true, result: selection.result };
    } catch (error: unknown) {
      const message = 'No se pudo aprobar por confianza.';
      return { ok: false, message: error instanceof Error ? message : message };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [input.canWrite, input.organizationId, input.year, input.monthIndex, input.threshold, selection]);

  return { selection, busy, run };
}
