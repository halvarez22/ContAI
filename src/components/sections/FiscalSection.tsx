import { FileText } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TaxPreviewCard } from '../TaxPreviewCard';
import { PaymentApplicationsCard } from '../PaymentApplicationsCard';
import { FiscalRiskListPanel } from '../FiscalRiskListPanel';
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
}: FiscalSectionProps) {
  const canApplyPayments = Boolean(organizationId && userId);
  const showFiscalRiskPanel =
    canManageFiscalRisk && Boolean(organizationId && userId);

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

      <TaxPreviewCard preview={taxPreview} variant="detailed" />
    </div>
  );
}
