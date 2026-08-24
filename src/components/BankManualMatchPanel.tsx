/**
 * Panel de resolución manual (E5.4) — solo UI.
 * Dos pasos: Aplicar (hints) → Confirmar (Firestore).
 */

import { Button } from './ui/Button';
import { formatCurrency, formatDate } from '../lib/utils';
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
  pickedTxId: string | null;
  onPickTx: (id: string) => void;
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
  pickedTxId,
  onPickTx,
  canApply,
  canConfirm,
  confirming,
  onApply,
  onConfirm,
  onClose,
}: BankManualMatchPanelProps) {
  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">
            Resolver fila {bankRowIndex + 1} (manual)
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDate(bankRow.fecha)} · {formatCurrency(bankRow.monto)} ·{' '}
            {bankRow.descripcion}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Estado: {status ?? '—'}
            {hint?.suggestionSource === 'manual' ? ' · match manual aplicado' : ''}
            . Paso 1: elegir y Aplicar. Paso 2: Confirmar (escribe en Firestore).
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

      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar en el libro del periodo (concepto, monto, fecha…)"
        className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2"
      />

      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-950/60">
        {candidates.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-400 text-center">
            Sin candidatos en el ledger del periodo
          </p>
        ) : (
          candidates.map((c) => {
            const selected = pickedTxId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPickTx(c.id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  selected
                    ? 'bg-indigo-100 dark:bg-indigo-900/40'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">
                    {c.concepto || c.id}
                  </span>
                  <span className="shrink-0 font-mono text-gray-500">
                    {c.proximityScore.toFixed(0)} pts
                  </span>
                </div>
                <div className="text-gray-500 mt-0.5">
                  {formatDate(c.fecha)} · {formatCurrency(c.monto)} ·{' '}
                  <span className="font-mono text-[10px]">{c.id.slice(0, 8)}</span>
                </div>
              </button>
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
          Aplicar match
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
