/**
 * Panel de resolución manual (E5.4 + E9.1 split) — solo UI.
 * Multi-select + montos; barra restante movimiento / factura.
 */

import { Button } from './ui/Button';
import { formatCurrency, formatDate } from '../lib/utils';
import { roundMoney } from '../services/taxCalculatorService';
import type {
  BankManualCandidate,
  BankMatchSuggestion,
  ParsedBankRow,
} from '../types/bankReconciliation';
import type { BankRowViewStatus } from '../lib/bankReconciliationView';

export type BankManualMatchPanelProps = {
  bankRowIndex: number;
  bankRow: ParsedBankRow;
  hint: BankMatchSuggestion | undefined;
  status: BankRowViewStatus | null;
  candidates: BankManualCandidate[];
  query: string;
  onQueryChange: (q: string) => void;
  draftLegs: Map<string, number>;
  draftAssigned: number;
  onToggleLeg: (txId: string, remaining: number, bankAmount: number) => void;
  onChangeLegAmount: (txId: string, amount: number) => void;
  canApply: boolean;
  canConfirm: boolean;
  confirming: boolean;
  onApply: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function BankManualMatchPanel({
  bankRowIndex,
  bankRow,
  hint,
  status,
  candidates,
  query,
  onQueryChange,
  draftLegs,
  draftAssigned,
  onToggleLeg,
  onChangeLegAmount,
  canApply,
  canConfirm,
  confirming,
  onApply,
  onConfirm,
  onClose,
}: BankManualMatchPanelProps) {
  const bankAmount = roundMoney(bankRow.monto);
  const remainingBank = roundMoney(bankAmount - draftAssigned);

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">
            Resolver fila {bankRowIndex + 1} (manual / split)
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDate(bankRow.fecha)} · {formatCurrency(bankRow.monto)} ·{' '}
            {bankRow.descripcion}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Estado: {status ?? '—'}
            {hint?.suggestionSource === 'manual' ? ' · match manual aplicado' : ''}
            {hint?.suggestionSource === 'heuristic_split'
              ? ' · split heurístico'
              : ''}
            . Seleccione una o varias facturas e indique montos.
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

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-ink-muted">Asignado del movimiento</p>
          <p className="font-mono font-semibold text-ink">
            {formatCurrency(draftAssigned)} / {formatCurrency(bankAmount)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-ink-muted">Restante del movimiento</p>
          <p
            className={`font-mono font-semibold ${
              remainingBank < -0.005 ? 'text-danger' : 'text-ink'
            }`}
          >
            {formatCurrency(remainingBank)}
          </p>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar en el libro del periodo (concepto, monto, fecha…)"
        className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2"
      />

      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-950/60">
        {candidates.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-400 text-center">
            Sin candidatos en el ledger del periodo
          </p>
        ) : (
          candidates.map((c) => {
            const selected = draftLegs.has(c.id);
            const legAmount = draftLegs.get(c.id) ?? 0;
            return (
              <div
                key={c.id}
                className={`px-3 py-2 text-xs ${
                  selected
                    ? 'bg-indigo-100 dark:bg-indigo-900/40'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected}
                    onChange={() =>
                      onToggleLeg(c.id, c.remaining, bankAmount)
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">
                        {c.concepto || c.id}
                      </span>
                      <span className="shrink-0 font-mono text-gray-500">
                        {c.proximityScore.toFixed(0)} pts
                      </span>
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      {formatDate(c.fecha)} · Factura {formatCurrency(c.monto)} ·
                      Restante factura {formatCurrency(c.remaining)}
                    </div>
                    {selected ? (
                      <label className="mt-1.5 flex items-center gap-2">
                        <span className="text-ink-muted">Monto a asignar</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={c.remaining}
                          value={legAmount}
                          onChange={(e) =>
                            onChangeLegAmount(
                              c.id,
                              Number(e.target.value) || 0
                            )
                          }
                          className="w-28 rounded border border-border bg-surface px-2 py-1 font-mono"
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          className="flex-1"
          variant="secondary"
          onClick={onApply}
          disabled={!canApply || confirming}
        >
          Aplicar match / split
        </Button>
        <Button
          className="flex-1"
          onClick={onConfirm}
          disabled={!canConfirm || confirming}
        >
          {confirming ? 'Confirmando…' : 'Confirmar esta fila'}
        </Button>
      </div>
    </div>
  );
}
