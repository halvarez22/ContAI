/**
 * Validación de la cola de revisión (E18). Puro: sin Firebase ni React.
 */

import type { CatalogAccount } from '../types/chartOfAccounts';
import type {
  AccountReassignmentPatch,
  ApprovalStatusPatch,
  BatchApprovalAction,
  BatchApprovalPlan,
  BatchApprovalTransaction,
} from '../types/batchApproval';
import {
  ACCOUNT_NOT_IN_CHART,
  CLOSED_PERIOD_REASON,
  MISSING_REJECT_REASON,
  NOT_IN_REVIEW_REASON,
  REJECT_REASON_MAX,
  REJECT_REASON_TOO_LONG,
} from '../types/batchApproval';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import { manualAccountFields } from './accountMappingService';
import { buildAccrualJournalEntry } from './journalEntryService';

function emptyPlan(): BatchApprovalPlan {
  return {
    patches: [],
    result: { successCount: 0, failedCount: 0, errors: [] },
  };
}

function findTransaction(
  transactions: readonly BatchApprovalTransaction[],
  id: string
): BatchApprovalTransaction | undefined {
  for (const tx of transactions) {
    if (tx.id === id) return tx;
  }
  return undefined;
}

export function canReclassify(status: string | null | undefined): boolean {
  return status !== 'conciliado';
}

export function planBatchApproval(input: {
  action: BatchApprovalAction;
  ids: readonly string[];
  transactions: readonly BatchApprovalTransaction[];
  periodosCerrados: readonly string[];
  reason?: string;
  actorLabel?: string;
  organizationId?: string;
}): BatchApprovalPlan {
  if (input.ids.length === 0) return emptyPlan();

  const closed = [...input.periodosCerrados];
  const rejectReason = input.reason?.trim() ?? '';
  const patches: ApprovalStatusPatch[] = [];
  const errors: BatchApprovalPlan['result']['errors'] = [];
  const seen = new Set<string>();

  for (const id of input.ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const tx = findTransaction(input.transactions, id);
    if (!tx || tx.status !== 'revisión') {
      errors.push({ id, reason: NOT_IN_REVIEW_REASON });
      continue;
    }
    if (
      input.organizationId &&
      tx.organization_id &&
      tx.organization_id !== input.organizationId
    ) {
      errors.push({ id, reason: 'No pertenece a la organización.' });
      continue;
    }
    if (Number.isNaN(new Date(tx.fecha).getTime())) {
      errors.push({ id, reason: 'Fecha inválida.' });
      continue;
    }
    if (isTransactionDateInClosedPeriod(tx.fecha, closed)) {
      errors.push({ id, reason: CLOSED_PERIOD_REASON });
      continue;
    }
    if (input.action === 'reject' && !rejectReason) {
      errors.push({ id, reason: MISSING_REJECT_REASON });
      continue;
    }
    if (input.action === 'reject' && rejectReason.length > REJECT_REASON_MAX) {
      errors.push({ id, reason: REJECT_REASON_TOO_LONG });
      continue;
    }
    if (input.action === 'approve') {
      patches.push({
        id,
        status: 'conciliado',
        ...(input.actorLabel ? { aprobado_por: input.actorLabel } : {}),
      });
    } else {
      patches.push({
        id,
        status: 'rechazado',
        motivo_rechazo: rejectReason,
        ...(input.actorLabel ? { rechazado_por: input.actorLabel } : {}),
      });
    }
  }

  return {
    patches,
    result: {
      successCount: patches.length,
      failedCount: errors.length,
      errors,
    },
  };
}

export function planAccountReassignment(input: {
  transaction: BatchApprovalTransaction;
  chart: readonly CatalogAccount[];
  accountCode: string;
  atajoPueBancos: boolean;
  periodosCerrados: readonly string[];
}): { ok: true; patch: AccountReassignmentPatch } | { ok: false; reason: string } {
  const tx = input.transaction;
  if (tx.status !== 'revisión') return { ok: false, reason: NOT_IN_REVIEW_REASON };
  if (Number.isNaN(new Date(tx.fecha).getTime())) {
    return { ok: false, reason: 'Fecha inválida.' };
  }
  if (isTransactionDateInClosedPeriod(tx.fecha, [...input.periodosCerrados])) {
    return { ok: false, reason: CLOSED_PERIOD_REASON };
  }
  const account = manualAccountFields(input.chart, input.accountCode);
  if (!account) return { ok: false, reason: ACCOUNT_NOT_IN_CHART };
  const accrual = buildAccrualJournalEntry(
    {
      id: tx.id,
      tipo: String(tx.tipo ?? ''),
      monto: Number(tx.monto ?? 0),
      fecha: tx.fecha,
      fiscal_subtotal: tx.fiscal_subtotal,
      fiscal_iva: tx.fiscal_iva,
      account_code: account.account_code,
      metodo_pago_sat: tx.metodo_pago_sat,
      concepto: tx.concepto,
      proveedor: tx.proveedor,
      is_nomina: tx.is_nomina === true,
    },
    input.chart,
    input.atajoPueBancos === true
  );
  if (accrual.ok === false) return { ok: false, reason: accrual.reason };
  return {
    ok: true,
    patch: {
      id: tx.id,
      account_code: account.account_code,
      account_name: account.account_name,
      account_source: 'manual',
      asiento_devengo: accrual.entry,
    },
  };
}
