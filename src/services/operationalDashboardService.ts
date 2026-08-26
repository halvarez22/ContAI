/**
 * Agregaciones puras para vista operativa (E7.2).
 * Una pasada O(n) sobre el periodo; ranking de riesgo precalculado en App.
 */

import { roundMoney } from './taxCalculatorService';
import type {
  OperationalAlert,
  OperationalCounts,
  OperationalRiskHint,
  OperationalSnapshot,
  OperationalTask,
  OperationalTaskKind,
  OperationalTxInput,
} from '../types/operationalDashboard';
import { OPERATIONAL_MAX_TASKS } from '../types/operationalDashboard';
import { normalizeRfc } from '../types/fiscalRisk';

const KIND_ORDER: Record<OperationalTaskKind, number> = {
  revision: 0,
  high_risk: 1,
  pending: 2,
  unclassified: 3,
};

const KIND_LABEL: Record<OperationalTaskKind, string> = {
  revision: 'En revisión',
  high_risk: 'Alto riesgo',
  pending: 'Pendiente',
  unclassified: 'Sin clasificar',
};

const KIND_COUNT_KEY: Record<
  OperationalTaskKind,
  keyof Omit<OperationalCounts, 'totalTasks'>
> = {
  revision: 'revision',
  high_risk: 'highRisk',
  pending: 'pending',
  unclassified: 'unclassified',
};

function classifyKind(
  tx: OperationalTxInput,
  riskSeverity: Map<string, 'high' | 'critical'>
): OperationalTaskKind | null {
  if (tx.status === 'revisión') return 'revision';
  const risk = riskSeverity.get(tx.id);
  if (risk === 'high' || risk === 'critical') return 'high_risk';
  if (tx.status === 'pendiente') return 'pending';
  if (!String(tx.account_name ?? '').trim()) return 'unclassified';
  return null;
}

function taskSeverity(
  kind: OperationalTaskKind,
  riskSeverity: Map<string, 'high' | 'critical'>,
  txId: string
): OperationalTask['severity'] {
  if (kind === 'revision') return 'warning';
  if (kind === 'high_risk') {
    return riskSeverity.get(txId) === 'critical' ? 'danger' : 'warning';
  }
  if (kind === 'pending') return 'info';
  return 'info';
}

function compareTasks(
  a: OperationalTask,
  b: OperationalTask,
  riskSeverity: Map<string, 'high' | 'critical'>
): number {
  const ka = KIND_ORDER[a.kind];
  const kb = KIND_ORDER[b.kind];
  if (ka !== kb) return ka - kb;
  if (a.kind === 'high_risk' && b.kind === 'high_risk') {
    const sa = riskSeverity.get(a.id) === 'critical' ? 0 : 1;
    const sb = riskSeverity.get(b.id) === 'critical' ? 0 : 1;
    if (sa !== sb) return sa - sb;
  }
  const ma = a.amount ?? 0;
  const mb = b.amount ?? 0;
  return mb - ma;
}

function buildAlerts(
  counts: OperationalCounts,
  hasTransactions: boolean,
  pctBankReconciled: number,
  txCount: number
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (!hasTransactions) {
    alerts.push({
      variant: 'info',
      title: 'Sin movimientos',
      body: 'No hay transacciones en este periodo. Importa datos o cambia mes/año.',
    });
    return alerts;
  }

  if (counts.totalTasks === 0) {
    alerts.push({
      variant: 'success',
      title: '¡Todo al día!',
      body: 'No hay tareas pendientes para este periodo.',
    });
  }

  if (counts.revision > 0) {
    alerts.push({
      variant: 'warning',
      title: 'Requieren revisión',
      body: `${counts.revision} transacción(es) en estado revisión.`,
    });
  }

  if (txCount > 0 && pctBankReconciled < 100) {
    alerts.push({
      variant: 'info',
      title: 'Conciliación bancaria',
      body: `${pctBankReconciled.toFixed(1)}% del periodo tiene bank_reconciled. Usa Conciliación para completar.`,
    });
  }

  return alerts;
}

export function buildOperationalSnapshot(input: {
  periodTransactions: OperationalTxInput[];
  periodoLabel: string;
  highRiskHints: OperationalRiskHint[];
  /** Set de RFCs normalizados de la lista 69-B vigente (lookup O(1)). */
  riskRfcs?: ReadonlySet<string>;
  maxTasks?: number;
}): OperationalSnapshot {
  const maxTasks = input.maxTasks ?? OPERATIONAL_MAX_TASKS;
  const riskSeverity = new Map<string, 'high' | 'critical'>();
  for (const h of input.highRiskHints) {
    riskSeverity.set(h.transactionId, h.severity);
  }

  const counts: OperationalCounts = {
    revision: 0,
    pending: 0,
    unclassified: 0,
    highRisk: 0,
    totalTasks: 0,
    fiscalRiskProviders: 0,
  };

  const allTasks: OperationalTask[] = [];
  let bankReconciledCount = 0;
  const txCount = input.periodTransactions.length;
  const riskRfcs = input.riskRfcs;
  const uniqueFiscalRiskRfcs = new Set<string>();

  for (const tx of input.periodTransactions) {
    if (tx.bank_reconciled === true || tx.bank_reconcile_status === 'full') {
      bankReconciledCount += 1;
    }

    if (riskRfcs && tx.rfc_contraparte) {
      const n = normalizeRfc(tx.rfc_contraparte);
      if (n && riskRfcs.has(n)) {
        uniqueFiscalRiskRfcs.add(n);
      }
    }

    const kind = classifyKind(tx, riskSeverity);
    if (!kind) continue;

    counts[KIND_COUNT_KEY[kind]] += 1;
    counts.totalTasks += 1;

    const amount = roundMoney(Number(tx.monto) || 0);
    allTasks.push({
      id: tx.id,
      kind,
      title: String(tx.proveedor || tx.concepto || 'Sin concepto').trim(),
      subtitle: `${KIND_LABEL[kind]} · ${tx.status ?? '—'}`,
      amount,
      severity: taskSeverity(kind, riskSeverity, tx.id),
    });
  }

  counts.fiscalRiskProviders = uniqueFiscalRiskRfcs.size;

  allTasks.sort((a, b) => compareTasks(a, b, riskSeverity));
  const tasks = allTasks.slice(0, maxTasks);

  const pctBankReconciled =
    txCount === 0 ? 0 : roundMoney((bankReconciledCount / txCount) * 100);

  const hasTransactions = txCount > 0;
  const isEmpty = !hasTransactions || counts.totalTasks === 0;

  const alerts = buildAlerts(counts, hasTransactions, pctBankReconciled, txCount);

  return {
    periodoLabel: input.periodoLabel,
    counts,
    tasks,
    alerts,
    isEmpty,
    hasTransactions,
    pctBankReconciled,
    bankReconciledCount,
    txCount,
  };
}
