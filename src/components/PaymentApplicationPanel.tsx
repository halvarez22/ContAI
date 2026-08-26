/**
 * Panel de aplicación manual de pagos (E9.2 F4) — solo UI.
 * Patrón visual/interacción de BankManualMatchPanel (E9.1).
 */

import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatCurrency, formatDate } from '../lib/utils';
import { roundMoney } from '../types/paymentApplication';
import type {
  PaymentFeedback,
  PaymentTargetCandidate,
} from '../hooks/usePaymentApplications';
import { sanitizeLegAmount } from '../hooks/usePaymentApplications';

export type PaymentApplicationPanelProps = {
  sourceLabel: string;
  sourceAmount: number;
  candidates: PaymentTargetCandidate[];
  query: string;
  onQueryChange: (q: string) => void;
  draftLegs: Map<string, number>;
  draftAssigned: number;
  onToggleLeg: (
    txId: string,
    saldoPendiente: number,
    sourceAmount: number
  ) => void;
  onChangeLegAmount: (txId: string, amount: number) => void;
  canConfirm: boolean;
  confirming: boolean;
  feedback: PaymentFeedback | null;
  onConfirm: () => void;
  onClose: () => void;
};

export function PaymentApplicationPanel({
  sourceLabel,
  sourceAmount,
  candidates,
  query,
  onQueryChange,
  draftLegs,
  draftAssigned,
  onToggleLeg,
  onChangeLegAmount,
  canConfirm,
  confirming,
  feedback,
  onConfirm,
  onClose,
}: PaymentApplicationPanelProps) {
  const remainingSource = roundMoney(sourceAmount - draftAssigned);

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">
            Aplicar pago a facturas
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">{sourceLabel}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            Origen {formatCurrency(sourceAmount)}. Seleccione una o varias
            facturas e indique montos.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        >
          Cerrar
        </button>
      </div>

      {feedback ? (
        <Alert variant={feedback.variant}>{feedback.message}</Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-ink-muted">Asignado del origen</p>
          <p className="font-mono font-semibold text-ink">
            {formatCurrency(draftAssigned)} / {formatCurrency(sourceAmount)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-ink-muted">Restante del origen</p>
          <p
            className={`font-mono font-semibold ${
              remainingSource < -0.005 ? 'text-danger' : 'text-ink'
            }`}
          >
            {formatCurrency(remainingSource)}
          </p>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar facturas del periodo (concepto, monto, fecha…)"
        aria-label="Buscar facturas destino"
        className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2"
      />

      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-950/60">
        {candidates.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-400 text-center">
            Sin facturas con saldo pendiente en el ledger del periodo
          </p>
        ) : (
          candidates.map((c) => {
            const selected = draftLegs.has(c.id);
            const legAmount = draftLegs.get(c.id) ?? 0;
            const remainingTarget = roundMoney(c.saldoPendiente - legAmount);
            return (
              <div
                key={c.id}
                className={`px-3 py-2 text-xs ${
                  c.closedPeriod
                    ? 'opacity-50 bg-gray-50 dark:bg-gray-900/40'
                    : selected
                      ? 'bg-indigo-100 dark:bg-indigo-900/40'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected}
                    disabled={c.closedPeriod || confirming}
                    title={
                      c.closedPeriod ? 'Factura en periodo cerrado' : undefined
                    }
                    aria-label={`Seleccionar factura ${c.concepto}`}
                    onChange={() =>
                      onToggleLeg(c.id, c.saldoPendiente, sourceAmount)
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium truncate">{c.concepto}</span>
                      {c.closedPeriod ? (
                        <Badge variant="warning" className="shrink-0 text-[10px]">
                          Factura en periodo cerrado
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      {formatDate(c.fecha)} · Factura {formatCurrency(c.monto)} ·
                      Restante factura {formatCurrency(c.saldoPendiente)}
                    </div>
                    {selected && !c.closedPeriod ? (
                      <label className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-ink-muted">Monto a asignar</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={c.saldoPendiente}
                          value={legAmount}
                          disabled={confirming}
                          aria-label={`Monto a asignar a ${c.concepto}`}
                          onChange={(e) =>
                            onChangeLegAmount(
                              c.id,
                              sanitizeLegAmount(e.target.value)
                            )
                          }
                          className="w-28 rounded border border-border bg-surface px-2 py-1 font-mono"
                        />
                        <span
                          className={`font-mono ${
                            remainingTarget < -0.005
                              ? 'text-danger'
                              : 'text-ink-muted'
                          }`}
                        >
                          Restante dest. {formatCurrency(remainingTarget)}
                        </span>
                      </label>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Button
        className="w-full"
        onClick={onConfirm}
        disabled={!canConfirm || confirming}
      >
        {confirming ? 'Confirmando…' : 'Confirmar aplicación'}
      </Button>
    </div>
  );
}
