import {
  APPROVAL_THRESHOLD_MAX,
  APPROVAL_THRESHOLD_MIN,
  AUTO_APPROVAL_ACTOR,
  DEFAULT_APPROVAL_CONFIDENCE_THRESHOLD,
} from '../config/autoApproval';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import { CLOSED_PERIOD_REASON } from '../types/batchApproval';
import type {
  AutoApprovalFields,
  AutoApprovalSelection,
  AutoApprovalTransaction,
} from '../types/autoApproval';
import {
  AUTO_APPROVAL_CONFIDENCE_REASON,
  AUTO_APPROVAL_ENTRY_REASON,
  AUTO_APPROVAL_INVALID_DATE,
} from '../types/autoApproval';
import { journalEntryBalances, parseJournalEntry } from './journalEntryService';

const THRESHOLD_RANGE_MESSAGE = 'El umbral debe estar entre 0 y 1.';

export function assertApprovalThreshold(value: number): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < APPROVAL_THRESHOLD_MIN ||
    value > APPROVAL_THRESHOLD_MAX
  ) {
    throw new Error(THRESHOLD_RANGE_MESSAGE);
  }
}

export function resolveApprovalThreshold(raw: unknown): number {
  if (
    typeof raw === 'number' &&
    Number.isFinite(raw) &&
    raw >= APPROVAL_THRESHOLD_MIN &&
    raw <= APPROVAL_THRESHOLD_MAX
  ) {
    return raw;
  }
  return DEFAULT_APPROVAL_CONFIDENCE_THRESHOLD;
}

export function toAutoApprovalFields(): AutoApprovalFields {
  return {
    status: 'conciliado',
    aprobado_por: AUTO_APPROVAL_ACTOR,
  };
}

function entryBalances(raw: unknown): boolean {
  const entry = parseJournalEntry(raw);
  return entry !== undefined && journalEntryBalances(entry);
}

function meetsThreshold(score: number | null | undefined, threshold: number): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= threshold;
}

/**
 * Elige qué movimientos en revisión pueden pasar a conciliado.
 * No escribe y no modifica el arreglo recibido.
 */
export function selectAutoApprovableTransactions(
  transactions: readonly AutoApprovalTransaction[],
  threshold: number,
  periodosCerrados: readonly string[]
): AutoApprovalSelection {
  const approved: AutoApprovalSelection['approved'] = [];
  const rejected: AutoApprovalSelection['result']['rejected'] = [];

  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold) ||
    threshold < APPROVAL_THRESHOLD_MIN ||
    threshold > APPROVAL_THRESHOLD_MAX
  ) {
    return {
      result: { approvedCount: 0, rejectedCount: 0, rejected: [] },
      approved,
    };
  }

  for (const source of transactions) {
    if (source.status !== 'revisión') continue;
    const id = source.id.trim();
    if (id.length === 0) continue;

    if (Number.isNaN(new Date(source.fecha).getTime())) {
      rejected.push({ id, reason: AUTO_APPROVAL_INVALID_DATE });
      continue;
    }
    if (isTransactionDateInClosedPeriod(source.fecha, [...periodosCerrados])) {
      rejected.push({ id, reason: CLOSED_PERIOD_REASON });
      continue;
    }
    const hasValidEntry =
      entryBalances(source.asiento_devengo) || entryBalances(source.asiento_liquidacion);
    if (!hasValidEntry) {
      rejected.push({ id, reason: AUTO_APPROVAL_ENTRY_REASON });
      continue;
    }
    const score = source.confidence_score;
    if (!meetsThreshold(score, threshold)) {
      rejected.push({ id, reason: AUTO_APPROVAL_CONFIDENCE_REASON });
      continue;
    }

    approved.push({
      id,
      confidence_score: score,
      hasValidEntry: true,
      isInClosedPeriod: false,
    });
  }

  return {
    result: {
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      rejected,
    },
    approved,
  };
}
