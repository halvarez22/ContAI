/** Contratos vista operativa (E7.2). Sin any. */

export type OperationalTaskKind =
  | 'revision'
  | 'pending'
  | 'unclassified'
  | 'high_risk';

export type OperationalTask = {
  id: string;
  kind: OperationalTaskKind;
  title: string;
  subtitle: string;
  amount?: number;
  severity: 'info' | 'warning' | 'danger';
};

export type OperationalCounts = {
  revision: number;
  pending: number;
  unclassified: number;
  highRisk: number;
  totalTasks: number;
};

export type OperationalAlert = {
  variant: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  body: string;
};

export type OperationalTxInput = {
  id: string;
  fecha: string | Date;
  tipo: string;
  monto: number | string;
  status?: string | null;
  account_name?: string | null;
  proveedor?: string | null;
  concepto?: string | null;
  bank_reconciled?: boolean | null;
};

export type OperationalRiskHint = {
  transactionId: string;
  severity: 'high' | 'critical';
};

export type OperationalSnapshot = {
  periodoLabel: string;
  counts: OperationalCounts;
  tasks: OperationalTask[];
  alerts: OperationalAlert[];
  isEmpty: boolean;
  hasTransactions: boolean;
  pctBankReconciled: number;
  bankReconciledCount: number;
  txCount: number;
};

export const OPERATIONAL_MAX_TASKS = 15;
