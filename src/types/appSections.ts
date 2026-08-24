/** Contratos de secciones migradas (E7.3). */

import type { ReactNode } from 'react';
import type { ClassifyBatchFn } from '../services/cfdiBatchImportService';
import type { BankLedgerItem } from './bankReconciliation';
import type { TaxPreview } from './taxPreview';
import type { DashboardMode } from './dashboardMode';
import type { ExecutiveSnapshot } from './executiveDashboard';
import type { OperationalSnapshot } from './operationalDashboard';

/** Tabs extraídas a Section Views en E7.3 */
export const MIGRATED_NAV_TAB_IDS = [
  'overview',
  'transactions',
  'reconciliation',
  'sat_download',
  'fiscal',
] as const;

export type MigratedNavTabId = (typeof MIGRATED_NAV_TAB_IDS)[number];

/** Ids de sidebar alineados a `navItems.ts` */
export const ALL_NAV_TAB_IDS = [
  ...MIGRATED_NAV_TAB_IDS,
  'analysis',
  'inventory',
  'recurring',
  'audit',
  'settings',
  'design_system',
] as const;

export type NavTabId = (typeof ALL_NAV_TAB_IDS)[number];

export function isNavTabId(id: string): id is NavTabId {
  return (ALL_NAV_TAB_IDS as readonly string[]).includes(id);
}

export function isMigratedNavTabId(id: string): id is MigratedNavTabId {
  return (MIGRATED_NAV_TAB_IDS as readonly string[]).includes(id);
}

/** Fila de transacción para UI (App sigue siendo fuente; sin any en sección) */
export type TransactionRow = {
  id: string;
  fecha: string | Date;
  tipo: string;
  monto: number | string;
  moneda?: string | null;
  status?: string | null;
  proveedor?: string | null;
  concepto?: string | null;
  account_name?: string | null;
  confidence_score?: number | null;
  tags?: string[] | null;
};

export type PeriodChangeHandler = (year: number, month: number) => void;

export type OverviewSectionProps = {
  periodYear: number;
  periodMonth: number;
  onPeriodChange: PeriodChangeHandler;
  onSelectCurrentMonth: () => void;
  yearAnchor: number;
  dashboardMode: DashboardMode;
  executiveSnapshot: ExecutiveSnapshot;
  operationalSnapshot: OperationalSnapshot;
  taxPreviewDisclaimer: string;
  executiveLoading: boolean;
  onGenerateBriefing: () => void;
  onNavigateTab: (tabId: string) => void;
  onOpenManualTx: () => void;
  onOpenCfdiImport: () => void;
  onOpenExcelImport: () => void;
};

export type TransactionFilters = {
  filterType: string;
  filterStatus: string;
  filterStartDate: string;
  filterEndDate: string;
  filterProvider: string;
  filterTag: string;
};

export type TransactionsSectionProps = {
  transactionsCount: number;
  filteredTransactions: TransactionRow[];
  filters: TransactionFilters;
  onFilterChange: {
    setFilterType: (v: string) => void;
    setFilterStatus: (v: string) => void;
    setFilterStartDate: (v: string) => void;
    setFilterEndDate: (v: string) => void;
    setFilterProvider: (v: string) => void;
    setFilterTag: (v: string) => void;
  };
  onGenerateMonthlyReport: () => void;
  onExportCsv: () => void;
  onOpenExcelImport: () => void;
  onOpenManualTx: () => void;
  onSelectTransaction: (tx: TransactionRow) => void;
};

export type ReconciliationSectionProps = {
  ledger: BankLedgerItem[];
  periodLabel: string;
};

export type SatDownloadSectionProps = {
  userId: string | undefined;
  organizationId: string | undefined;
  defaultRfc: string;
  periodosCerrados: string[];
  highAmountReviewThreshold: number;
  classify: ClassifyBatchFn;
};

export type FiscalSectionProps = {
  taxPreview: TaxPreview;
  periodLabel: string;
  periodoActualCerrado: boolean;
  onTogglePeriodo: () => void;
  onOpenCfdiImport: () => void;
};

/** Mapa tipado de render (documentación; App compone hijos directamente) */
export type SectionRenderMap = Record<MigratedNavTabId, ReactNode>;
