import { FileText } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TaxPreviewCard } from '../TaxPreviewCard';
import { PaymentApplicationsCard } from '../PaymentApplicationsCard';
import { FiscalRiskListPanel } from '../FiscalRiskListPanel';
import { TrialBalanceSection } from './TrialBalanceSection';
import { IncomeStatementSection } from './IncomeStatementSection';
import { BalanceSheetSection } from './BalanceSheetSection';
import { useFinancialReports } from '../../hooks/useFinancialReports';
import { downloadTextFileBrowser } from '../../hooks/usePolizaExport';
import {
  formatIncomeStatementToCsv,
  formatTrialBalanceToCsv,
  reportExportGate,
} from '../../lib/reportFormatters';
import type { FiscalSectionProps } from '../../types/appSections';

export function FiscalSection({
  taxPreview,
  periodLabel,
  periodoActualCerrado,
  onTogglePeriodo,
  onOpenCfdiImport,
  organizationId,
  userId,
  periodosCerrados = [],
  paymentLedger = [],
  onPaymentApplicationsConfirmed,
  canManageFiscalRisk = false,
  onFiscalRiskListPublished,
  reportTransactions = [],
  reportChart = [],
  periodYear,
  periodMonth,
  reportsTruncated = false,
}: FiscalSectionProps) {
  const canApplyPayments = Boolean(organizationId && userId);
  const showReports = periodYear != null && periodMonth != null;
  const financialReports = useFinancialReports({
    transactions: reportTransactions,
    chart: reportChart,
    year: periodYear ?? 0,
    monthIndex: periodMonth ?? 0,
    truncated: reportsTruncated,
    organizationId,
  });
  const showFiscalRiskPanel =
    canManageFiscalRisk && Boolean(organizationId && userId);
  const trialExport = reportExportGate({
    truncated: financialReports.trialBalance.truncated,
    rowCount: financialReports.trialBalance.rows.length,
  });
  const statementExport = reportExportGate({
    truncated: financialReports.trialBalance.truncated,
    rowCount: financialReports.incomeStatement.rows.length,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administración fiscal"
        description="Usa el mismo periodo que el panel general. Los importes son internos y no sustituyen declaraciones ante el SAT."
      />

      <Card className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="font-bold text-ink">Cierre de mes</p>
          <p className="text-xs text-ink-muted mt-1">
            Periodo {periodLabel}:{' '}
            {periodoActualCerrado ? (
              <span className="text-warning font-medium">cerrado — no se editan movimientos</span>
            ) : (
              <span className="text-success font-medium">abierto</span>
            )}
          </p>
        </div>
        <Button
          variant={periodoActualCerrado ? 'secondary' : 'danger'}
          type="button"
          onClick={onTogglePeriodo}
        >
          {periodoActualCerrado ? 'Abrir periodo' : 'Cerrar periodo'}
        </Button>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-bold text-ink flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand" />
              Importar CFDI (XML)
            </p>
            <p className="text-xs text-ink-muted mt-1">
              Archivo XML del comprobante. No valida timbrado; crea una transacción con datos del XML.
            </p>
          </div>
          <Button variant="secondary" type="button" onClick={onOpenCfdiImport}>
            Importar XML
          </Button>
        </div>
      </Card>

      {showFiscalRiskPanel ? (
        <Card className="p-6">
          <FiscalRiskListPanel
            organizationId={organizationId!}
            userId={userId!}
            canUpload={canManageFiscalRisk}
            onPublished={onFiscalRiskListPublished}
          />
        </Card>
      ) : null}

      {canApplyPayments ? (
        <Card className="p-6">
          <PaymentApplicationsCard
            organizationId={organizationId!}
            userId={userId!}
            periodosCerrados={periodosCerrados}
            ledger={paymentLedger}
            onConfirmed={onPaymentApplicationsConfirmed}
          />
        </Card>
      ) : null}

      {showReports ? (
        <Card className="p-6 space-y-6">
          <TrialBalanceSection
            report={financialReports.trialBalance}
            onExport={() =>
              downloadTextFileBrowser(
                formatTrialBalanceToCsv(financialReports.trialBalance),
                `balanza_ContAI_${financialReports.trialBalance.periodKey}.csv`
              )
            }
            exportDisabled={trialExport.disabled}
            exportDisabledHint={trialExport.hint}
          />
          <IncomeStatementSection
            report={financialReports.incomeStatement}
            onExport={() =>
              downloadTextFileBrowser(
                formatIncomeStatementToCsv(financialReports.incomeStatement),
                `estado_resultados_ContAI_${financialReports.incomeStatement.periodKey}.csv`
              )
            }
            exportDisabled={statementExport.disabled}
            exportDisabledHint={statementExport.hint}
          />
          <BalanceSheetSection report={financialReports.balanceSheet} />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={!financialReports.canRegister || financialReports.registering}
              title={
                financialReports.canRegister
                  ? 'Deja constancia del cuadre en la bitácora'
                  : 'Elige una organización para registrar'
              }
              onClick={() => {
                void financialReports.register();
              }}
            >
              {financialReports.registering ? 'Registrando…' : 'Registrar reportes del periodo'}
            </Button>
            {financialReports.registered ? (
              <p className="text-xs text-ink-muted">Quedó asentado en la bitácora.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <TaxPreviewCard preview={taxPreview} variant="detailed" />
    </div>
  );
}
