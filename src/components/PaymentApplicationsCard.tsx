/**
 * Contenedor Fiscal: selección de origen + PaymentApplicationPanel (E9.2 F4).
 */

import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { formatCurrency } from '../lib/utils';
import { PaymentApplicationPanel } from './PaymentApplicationPanel';
import {
  usePaymentApplications,
  type PaymentLedgerItem,
} from '../hooks/usePaymentApplications';

export type PaymentApplicationsCardProps = {
  organizationId: string;
  userId: string;
  periodosCerrados: readonly string[];
  ledger: readonly PaymentLedgerItem[];
  onConfirmed?: () => void;
};

export function PaymentApplicationsCard({
  organizationId,
  userId,
  periodosCerrados,
  ledger,
  onConfirmed,
}: PaymentApplicationsCardProps) {
  const pay = usePaymentApplications({
    organizationId,
    userId,
    periodosCerrados,
    ledger,
    onConfirmed,
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-ink">Aplicar pagos</p>
        <p className="text-xs text-ink-muted mt-1">
          Asigne un CFDI tipo P o un pago manual a una o varias facturas con
          saldo pendiente (máx. 8).
        </p>
      </div>

      {!pay.source ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              CFDI tipo P del periodo
            </p>
            {pay.paymentSources.length === 0 ? (
              <p className="text-xs text-ink-subtle">
                No hay CFDI de pago (tipo P) en el ledger del periodo.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {pay.paymentSources.map((src) => (
                  <li
                    key={src.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate text-ink">
                        {src.concepto || src.cfdi_uuid || src.id}
                      </p>
                      <p className="text-ink-muted">
                        {formatCurrency(src.monto)}
                        {src.cfdi_uuid ? ` · ${src.cfdi_uuid}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => pay.selectCfdiPagoSource(src)}
                    >
                      Aplicar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              Pago manual
            </p>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="manual-payment-amount"
                  className="text-[10px] font-bold text-ink-subtle uppercase"
                >
                  Monto origen
                </label>
                <Input
                  id="manual-payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={pay.manualAmountInput}
                  onChange={(e) => pay.setManualAmountInput(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button type="button" onClick={pay.beginManualSource}>
                Continuar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <PaymentApplicationPanel
          sourceLabel={pay.source.label}
          sourceAmount={pay.source.sourceAmount}
          candidates={pay.candidates}
          query={pay.candidateQuery}
          onQueryChange={pay.setCandidateQuery}
          draftLegs={pay.draftLegs}
          draftAssigned={pay.draftAssigned}
          aiSuggestedIds={pay.aiSuggestedIds}
          aiProposing={pay.aiProposing}
          onToggleLeg={pay.toggleDraftLeg}
          onChangeLegAmount={pay.setDraftLegAmount}
          canConfirm={pay.canConfirm}
          confirming={pay.confirming}
          canSuggestAi={
            Boolean(pay.source) &&
            pay.candidates.some((c) => !c.closedPeriod)
          }
          onSuggestAi={() => void pay.handleSuggestWithAi()}
          feedback={pay.feedback}
          onConfirm={() => void pay.handleConfirm()}
          onClose={pay.clearSource}
        />
      )}
    </div>
  );
}
