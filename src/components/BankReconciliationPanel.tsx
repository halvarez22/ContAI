import { AlertTriangle, Upload } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { useBankReconciliation } from '../hooks/useBankReconciliation';
import { BankManualMatchPanel } from './BankManualMatchPanel';
import type { BankLedgerItem } from '../types/bankReconciliation';
import type { BankRowFilter } from '../lib/bankReconciliationView';
import { getBankRowViewStatus } from '../lib/bankReconciliationView';

export type BankReconciliationPanelProps = {
  ledger: BankLedgerItem[];
  periodLabel?: string;
  organizationId?: string;
  userId?: string;
};

const FILTERS: Array<{ id: BankRowFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'ready', label: 'Listos' },
  { id: 'conflict', label: 'Conflictos' },
  { id: 'no_match', label: 'Sin match' },
  { id: 'ai_error', label: 'Error IA' },
];

function sourceLabel(
  source: string | undefined,
  hasTx: boolean,
  sessionConfirmed: boolean
): string {
  if (sessionConfirmed) return 'Confirmada';
  if (source === 'manual') return 'Manual';
  if (source === 'ai') return 'IA';
  if (source === 'heuristic_split') return 'Split';
  if (hasTx) return 'Heurística';
  return '—';
}

export function BankReconciliationPanel({
  ledger,
  periodLabel,
  organizationId,
  userId,
}: BankReconciliationPanelProps) {
  const bank = useBankReconciliation({ ledger, organizationId, userId });

  return (
    <div className="space-y-6">
      <Card className="p-4 lg:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                Conciliación bancaria
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xl">
              CSV con columnas{' '}
              <span className="font-mono">fecha, monto, descripción</span>.
              Heurística (±2% / ±4 días) y split 1→N; IA en casos difíciles.
              Conflicto / sin match: clic en la fila para resolver (multi-factura
              → confirmar).
              {periodLabel ? (
                <span className="block mt-1 text-gray-400">
                  Periodo: {periodLabel}
                </span>
              ) : null}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-indigo-600 dark:text-indigo-400 shrink-0">
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                bank.handleBankFile(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
            <span className="underline">Seleccionar CSV</span>
          </label>
        </div>

        {bank.csvPreview && (
          <>
            {bank.csvPreview.errors.length > 0 && (
              <p className="text-xs text-amber-600">
                {bank.csvPreview.errors.slice(0, 5).join(' · ')}
              </p>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              {FILTERS.map((f) => {
                const count =
                  f.id === 'all'
                    ? bank.csvPreview!.rows.length
                    : bank.counts[f.id];
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => bank.setFilter(f.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border transition-colors',
                      bank.filter === f.id
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                    )}
                  >
                    {f.label} ({count})
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-gray-500">
              {bank.csvPreview.rows.length} movimientos · {bank.readyCount}{' '}
              listos · {bank.counts.conflict} conflicto ·{' '}
              {bank.eligibleAiCount} elegibles IA
              {ledger.length === 0 ? (
                <span className="text-amber-600">
                  {' '}
                  · Sin transacciones en el periodo del panel
                </span>
              ) : null}
            </p>

            {bank.aiProgress && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400">
                {bank.aiProgress}
              </p>
            )}

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 text-[10px] uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-3 py-2 font-bold">#</th>
                    <th className="px-3 py-2 font-bold">Fecha</th>
                    <th className="px-3 py-2 font-bold">Monto</th>
                    <th className="px-3 py-2 font-bold">Descripción</th>
                    <th className="px-3 py-2 font-bold">Estado</th>
                    <th className="px-3 py-2 font-bold">Fuente</th>
                    <th className="px-3 py-2 font-bold">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {bank.visibleIndices.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-gray-400"
                      >
                        No hay filas en este filtro
                      </td>
                    </tr>
                  ) : (
                    bank.visibleIndices.map((i) => {
                      const r = bank.csvPreview!.rows[i];
                      const h = bank.hints[i];
                      const err = bank.aiErrors[i];
                      const confirmed = bank.sessionConfirmed.has(i);
                      const status = getBankRowViewStatus(h, err, confirmed);
                      const resolvable = bank.isRowResolvable(i);
                      const selected = bank.selectedRowIndex === i;
                      return (
                        <tr
                          key={i}
                          onClick={() => {
                            if (resolvable) bank.selectRowForManual(i);
                          }}
                          onKeyDown={(e) => {
                            if (
                              resolvable &&
                              (e.key === 'Enter' || e.key === ' ')
                            ) {
                              e.preventDefault();
                              bank.selectRowForManual(i);
                            }
                          }}
                          tabIndex={resolvable ? 0 : undefined}
                          role={resolvable ? 'button' : undefined}
                          className={cn(
                            'bg-white dark:bg-gray-950/40',
                            resolvable &&
                              'cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30',
                            selected &&
                              'ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700'
                          )}
                        >
                          <td className="px-3 py-2 font-mono text-gray-400">
                            {i + 1}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatDate(r.fecha)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-medium">
                            {formatCurrency(r.monto)}
                          </td>
                          <td
                            className="px-3 py-2 max-w-[220px] truncate"
                            title={r.descripcion}
                          >
                            {r.descripcion}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {confirmed && (
                              <span className="text-emerald-700 font-medium">
                                Conciliada
                              </span>
                            )}
                            {!confirmed && status === 'ai_error' && (
                              <span className="text-amber-600" title={err}>
                                Error IA
                              </span>
                            )}
                            {!confirmed && status === 'conflict' && (
                              <span
                                className="text-amber-600 inline-flex items-center gap-1"
                                title={h?.note}
                              >
                                <AlertTriangle className="w-3 h-3" /> Conflicto
                              </span>
                            )}
                            {!confirmed && status === 'ready' && (
                              <span className="text-emerald-600">
                                {(h?.allocations?.length ?? 0) > 1
                                  ? `Listo (split ${h!.allocations.length})`
                                  : 'Listo'}
                              </span>
                            )}
                            {!confirmed && status === 'no_match' && (
                              <span className="text-gray-400">Sin match</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {sourceLabel(
                              h?.suggestionSource,
                              Boolean(h?.transactionId),
                              confirmed
                            )}
                          </td>
                          <td
                            className="px-3 py-2 max-w-[200px] truncate text-gray-400"
                            title={err || h?.note}
                          >
                            {err || h?.note || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {bank.selectedRowIndex != null &&
              bank.selectedBankRow &&
              bank.isRowResolvable(bank.selectedRowIndex) && (
                <BankManualMatchPanel
                  bankRowIndex={bank.selectedRowIndex}
                  bankRow={bank.selectedBankRow}
                  hint={bank.selectedHint ?? undefined}
                  status={bank.selectedStatus}
                  candidates={bank.manualCandidates}
                  query={bank.candidateQuery}
                  onQueryChange={bank.setCandidateQuery}
                  draftLegs={bank.draftLegs}
                  draftAssigned={bank.draftAssigned}
                  onToggleLeg={bank.toggleDraftLeg}
                  onChangeLegAmount={bank.setDraftLegAmount}
                  canApply={bank.canApplyManual}
                  canConfirm={bank.canConfirmSingle}
                  confirming={bank.confirmingSingle}
                  onApply={bank.handleApplyManual}
                  onConfirm={() => void bank.handleConfirmSingle()}
                  onClose={() => bank.selectRowForManual(null)}
                />
              )}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => void bank.handleSuggestWithAi()}
                disabled={
                  bank.aiEnriching ||
                  bank.confirming ||
                  bank.confirmingSingle ||
                  bank.eligibleAiCount === 0
                }
              >
                {bank.aiEnriching ? 'Sugeriendo con IA…' : 'Sugerir con IA'}
              </Button>
              <Button
                className="flex-1"
                onClick={() => void bank.handleConfirm()}
                disabled={
                  bank.confirming ||
                  bank.confirmingSingle ||
                  bank.aiEnriching ||
                  bank.readyCount === 0
                }
              >
                {bank.confirming
                  ? 'Confirmando…'
                  : 'Confirmar coincidencias sin conflicto'}
              </Button>
            </div>

            {bank.message && (
              <p className="text-xs text-gray-600 dark:text-gray-300">
                {bank.message}
              </p>
            )}
          </>
        )}

        {!bank.csvPreview && (
          <p className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
            Selecciona un extracto CSV para comenzar
          </p>
        )}
      </Card>
    </div>
  );
}
