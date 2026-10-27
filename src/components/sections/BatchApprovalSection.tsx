import { useState } from 'react';
import type { CatalogAccount } from '../../types/chartOfAccounts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatCurrency } from '../../lib/utils';
import { useBatchApproval, type ReviewSource } from '../../hooks/useBatchApproval';

const SELECT_HINT = 'Selecciona al menos una transacción';
const ROLE_HINT = 'Tu rol no puede aprobar movimientos.';

export function BatchApprovalSection({
  transactions,
  chart,
  year,
  monthIndex,
  organizationId,
  periodosCerrados,
  canWrite,
  atajoPueBancos,
  actorLabel,
}: {
  transactions: readonly ReviewSource[];
  chart: readonly CatalogAccount[];
  year: number;
  monthIndex: number;
  organizationId?: string;
  periodosCerrados: readonly string[];
  canWrite: boolean;
  atajoPueBancos: boolean;
  actorLabel: string;
}) {
  const { queue, busy, run, reassign } = useBatchApproval({
    transactions,
    chart,
    year,
    monthIndex,
    organizationId,
    periodosCerrados,
    canWrite,
    atajoPueBancos,
    actorLabel,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [accountChoice, setAccountChoice] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const accounts = chart.filter((account) => account.activa);
  const selectedIds = selected.filter((id) => queue.some((row) => row.id === id));
  const blocked = !canWrite || busy;
  const actionTitle = !canWrite ? ROLE_HINT : selectedIds.length === 0 ? SELECT_HINT : undefined;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function apply(action: 'approve' | 'reject') {
    const result = await run(action, selectedIds, reason);
    const next: Record<string, string> = {};
    for (const error of result.errors) next[error.id] = error.reason;
    setRowError(next);
    setSelected(result.errors.map((error) => error.id));
    setNotice(
      result.successCount > 0
        ? `Se actualizaron ${result.successCount} movimientos.`
        : ''
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <p className="font-bold text-ink">Revisión del periodo</p>
        <p className="text-xs text-ink-muted mt-1">
          Movimientos que siguen en revisión. Corrige la cuenta y después aprueba o rechaza la selección.
        </p>
      </div>

      {queue.length === 0 ? (
        <p className="text-sm text-ink">No hay transacciones que requieran tu revisión. ¡Todo en orden!</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-ink-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Elegir</th>
                  <th className="py-2 pr-3 font-medium">Concepto</th>
                  <th className="py-2 pr-3 font-medium text-right">Monto</th>
                  <th className="py-2 pr-3 font-medium">Cuenta</th>
                  <th className="py-2 font-medium">Aviso</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr key={row.id} className="border-b border-border align-top">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`Elegir ${row.concepto || row.id}`}
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="py-2 pr-3 text-ink">
                      <p>{row.concepto || 'Sin concepto'}</p>
                      {row.policy_review_reason ? (
                        <p className="text-xs text-ink-muted mt-1">{row.policy_review_reason}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-ink">
                      {formatCurrency(row.monto ?? 0)}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          aria-label={`Cuenta de ${row.concepto || row.id}`}
                          className="bg-surface border border-border rounded-lg px-2 py-1 text-sm text-ink"
                          value={accountChoice[row.id] ?? row.account_code ?? ''}
                          onChange={(event) =>
                            setAccountChoice((current) => ({ ...current, [row.id]: event.target.value }))
                          }
                          disabled={blocked}
                        >
                          <option value="">Elige una cuenta</option>
                          {accounts.map((account) => (
                            <option key={account.code} value={account.code}>
                              {account.code} {account.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={blocked || !(accountChoice[row.id] ?? row.account_code)}
                          title={canWrite ? 'Guarda la cuenta y reconstruye el asiento de devengo' : ROLE_HINT}
                          onClick={() => {
                            void reassign(row.id, accountChoice[row.id] ?? row.account_code ?? '').then((saved) => {
                              if (saved.ok) {
                                setRowError((current) => {
                                  const next = { ...current };
                                  delete next[row.id];
                                  return next;
                                });
                                setNotice('La cuenta quedó actualizada. El movimiento sigue en revisión.');
                                return;
                              }
                              setRowError((current) => ({ ...current, [row.id]: saved.reason }));
                            });
                          }}
                        >
                          Guardar cuenta
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 text-xs text-danger">{rowError[row.id] ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="block text-xs text-ink-muted">
            Motivo del rechazo
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              rows={2}
              className="mt-1 w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ink"
              placeholder="Obligatorio solo para rechazar"
            />
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <span title={actionTitle}>
              <Button
                type="button"
                disabled={blocked || selectedIds.length === 0}
                onClick={() => {
                  void apply('approve');
                }}
              >
                Aprobar selección
              </Button>
            </span>
            <span title={actionTitle}>
              <Button
                type="button"
                variant="danger"
                disabled={blocked || selectedIds.length === 0}
                onClick={() => {
                  void apply('reject');
                }}
              >
                Rechazar selección
              </Button>
            </span>
          </div>
          {selectedIds.length === 0 ? (
            <p className="text-xs text-ink-muted">{canWrite ? SELECT_HINT : ROLE_HINT}</p>
          ) : null}
          {notice ? <p className="text-xs text-ink-muted">{notice}</p> : null}
        </>
      )}
    </Card>
  );
}
