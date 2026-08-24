import { ExecutiveDashboardView } from '../ExecutiveDashboardView';
import { OperationalDashboardView } from '../OperationalDashboardView';
import { PeriodSelectorCard } from './PeriodSelectorCard';
import type { OverviewSectionProps } from '../../types/appSections';

export function OverviewSection({
  periodYear,
  periodMonth,
  onPeriodChange,
  onSelectCurrentMonth,
  yearAnchor,
  dashboardMode,
  executiveSnapshot,
  operationalSnapshot,
  taxPreviewDisclaimer,
  executiveLoading,
  onGenerateBriefing,
  onNavigateTab,
  onOpenManualTx,
  onOpenCfdiImport,
  onOpenExcelImport,
}: OverviewSectionProps) {
  return (
    <>
      <PeriodSelectorCard
        periodYear={periodYear}
        periodMonth={periodMonth}
        onPeriodChange={onPeriodChange}
        onSelectCurrentMonth={onSelectCurrentMonth}
        yearAnchor={yearAnchor}
      />
      {dashboardMode === 'ejecutivo' ? (
        <ExecutiveDashboardView
          kpis={executiveSnapshot.kpis}
          trend={executiveSnapshot.trend}
          disclaimer={taxPreviewDisclaimer}
          briefingLoading={executiveLoading}
          onGenerateBriefing={onGenerateBriefing}
        />
      ) : (
        <OperationalDashboardView
          snapshot={operationalSnapshot}
          onNavigateTab={onNavigateTab}
          onOpenManualTx={onOpenManualTx}
          onOpenCfdiImport={onOpenCfdiImport}
          onOpenExcelImport={onOpenExcelImport}
          onTaskAction={() => onNavigateTab('transactions')}
        />
      )}
    </>
  );
}
