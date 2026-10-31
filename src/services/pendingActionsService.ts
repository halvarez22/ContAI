import type {
  PendingActionCategory,
  PendingActionItem,
  PendingActionSource,
  PendingActionsReport,
  PendingActionsSummary,
} from '../types/pendingActions';

const REASON_IN_REVIEW = 'En revisión';
const REASON_MISSING_ACCOUNT = 'Falta la cuenta';
const REASON_PENDING_RECONCILIATION = 'Pendiente de conciliar con el banco';

function isInSelectedMonth(fecha: string, year: number, monthIndex: number): boolean {
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getFullYear() === year && parsed.getMonth() === monthIndex;
}

function hasValidAccount(accountCode: string | null | undefined): boolean {
  return typeof accountCode === 'string' && accountCode.trim().length > 0;
}

function isBankSettled(source: PendingActionSource): boolean {
  return source.bank_reconciled === true || source.bank_reconcile_status === 'full';
}

function reasonFor(category: PendingActionCategory, source: PendingActionSource): string {
  if (category === 'in_review') {
    const saved = source.policy_review_reason;
    if (typeof saved === 'string' && saved.trim().length > 0) return saved.trim();
    return REASON_IN_REVIEW;
  }
  if (category === 'missing_account') return REASON_MISSING_ACCOUNT;
  return REASON_PENDING_RECONCILIATION;
}

function emptySummary(): PendingActionsSummary {
  return {
    in_review: 0,
    missing_account: 0,
    pending_reconciliation: 0,
    total: 0,
  };
}

/**
 * Clasifica el mes en una sola lista por movimiento.
 * No escribe, no ordena el arreglo recibido y no llama a Firebase.
 */
export function aggregatePendingActions(
  transactions: readonly PendingActionSource[],
  year: number,
  monthIndex: number
): PendingActionsReport {
  const items: PendingActionItem[] = [];

  for (const source of transactions) {
    if (!isInSelectedMonth(source.fecha, year, monthIndex)) continue;
    const id = source.id.trim();
    if (id.length === 0) continue;

    let category: PendingActionCategory | null = null;
    if (source.status === 'rechazado') {
      category = null;
    } else if (source.status === 'revisión') {
      category = 'in_review';
    } else if (!hasValidAccount(source.account_code)) {
      category = 'missing_account';
    } else if (!isBankSettled(source)) {
      category = 'pending_reconciliation';
    }

    if (category === null) continue;

    const monto = Number.isFinite(source.monto) ? source.monto : 0;
    items.push({
      id,
      fecha: source.fecha,
      concepto: source.concepto,
      monto,
      category,
      reason: reasonFor(category, source),
    });
  }

  const summary = emptySummary();
  for (const item of items) {
    summary[item.category] += 1;
  }
  summary.total = items.length;

  return { items, summary };
}
