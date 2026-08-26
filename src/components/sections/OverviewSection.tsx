import { lazy, Suspense } from 'react';
import { OperationalDashboardView } from '../OperationalDashboardView';
import { PeriodSelectorCard } from './PeriodSelectorCard';
import { SectionSuspenseFallback } from '../SectionSuspenseFallback';
import type { OverviewSectionProps } from '../../types/appSections';

const ExecutiveDashboardView = lazy(() =>
  import('../ExecutiveDashboardView').then((m) => ({
    default: m.ExecutiveDashboardView,
  }))
);

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
        <Suspense fallback={<SectionSuspenseFallback label="Cargando vista ejecutiva…" />}>
          <ExecutiveDashboardView
            kpis={executiveSnapshot.kpis}
            trend={executiveSnapshot.trend}
            disclaimer={taxPreviewDisclaimer}
            briefingLoading={executiveLoading}
            onGenerateBriefing={onGenerateBriefing}
          />
        </Suspense>
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
