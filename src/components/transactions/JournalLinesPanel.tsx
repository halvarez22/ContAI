import { useState } from 'react';
import { formatCurrency } from '../../lib/utils';
import { isTransactionDateInClosedPeriod } from '../../lib/periodClose';
import { NOMINA_REASSIGN_BLOCKED } from '../../config/nominaDefaults';
import { NOT_IN_REVIEW_REASON } from '../../types/batchApproval';
import type { CatalogAccount } from '../../types/chartOfAccounts';
import { LIQUIDACION_REASSIGN_BLOCKED } from '../../types/journalEntry';
import type { JournalEntry } from '../../types/journalEntry';
import { parseJournalEntry } from '../../services/journalEntryService';
import { useLineReassignment } from '../../hooks/useLineReassignment';
import { Button } from '../ui/Button';

const ROLE_HINT = 'No puedes modificar los movimientos de esta organización.';
const CLOSED_HINT = 'Periodo cerrado';
const EMPTY_ENTRY = 'Este movimiento no tiene un asiento guardado.';

export type JournalLinesPanelProps = {
  transactionId: string;
  status?: string | null;
  fecha: string;
  isNomina?: boolean;
  cfdiTipo?: string | null;
  asientoDevengo?: unknown;
  asientoLiquidacion?: unknown;
  chart: readonly CatalogAccount[];
  periodosCerrados: readonly string[];
  canWrite: boolean;
  organizationId?: string;
  onUpdated: (entry: JournalEntry) => void;
};

export function JournalLinesPanel({
  transactionId,
  status,
  fecha,
  isNomina,
  cfdiTipo,
  asientoDevengo,
  asientoLiquidacion,
  chart,
  periodosCerrados,
  canWrite,
  organizationId,
  onUpdated,
}: JournalLinesPanelProps) {
  const devengo = parseJournalEntry(asientoDevengo);
  const liquidacion = parseJournalEntry(asientoLiquidacion);
  const entry = devengo ?? liquidacion;
  const isTipoP = String(cfdiTipo || '').toUpperCase() === 'P';
  const periodClosed = isTransactionDateInClosedPeriod(fecha, [...periodosCerrados]);
  const editable =
    canWrite &&
    status === 'revisión' &&
    isNomina !== true &&
    !isTipoP &&
    !periodClosed &&
    devengo !== undefined;
  const activeAccounts = chart.filter((account) => account.activa);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const { save, saving } = useLineReassignment({
    transactionId,
    status,
    fecha,
    isNomina,
    cfdiTipo,
    periodosCerrados,
    chart,
    canWrite,
    organizationId,
  });

  const hint = !entry
    ? EMPTY_ENTRY
    : isNomina
      ? NOMINA_REASSIGN_BLOCKED
      : isTipoP
        ? LIQUIDACION_REASSIGN_BLOCKED
        : !canWrite
          ? ROLE_HINT
          : status !== 'revisión'
            ? NOT_IN_REVIEW_REASON
            : periodClosed
              ? CLOSED_HINT
              : devengo === undefined
                ? 'Este asiento solo se puede consultar.'
                : '';

  if (!entry) {
    return <p className="text-sm text-ink-muted">{EMPTY_ENTRY}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-bold text-ink">Líneas del asiento</h4>
        {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      </div>
      <ul className="divide-y divide-border">
        {entry.lines.map((line, index) => {
          const selected = choice[index] ?? line.account_code;
          return (
            <li key={`${line.account_code}-${index}`} className="py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {line.account_code} {line.account_name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {line.tipo === 'cargo' ? 'Cargo' : 'Abono'} · {line.concepto}
                  </p>
                </div>
                <span className="font-mono text-sm text-ink tabular-nums">{formatCurrency(line.monto)}</span>
              </div>
              {editable ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label={`Cuenta de la línea ${index + 1}`}
                    className="bg-surface border border-border rounded-lg px-2 py-1 text-sm text-ink"
                    value={selected}
                    disabled={saving}
                    onChange={(event) =>
                      setChoice((current) => ({ ...current, [index]: event.target.value }))
                    }
                  >
                    {activeAccounts.map((account) => (
                      <option key={account.code} value={account.code}>
                        {account.code} {account.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs py-1 px-3"
                    disabled={saving || !devengo}
                    onClick={() => {
                      if (!devengo) return;
                      void save(index, selected, devengo).then((saved) => {
                        if (saved.ok) {
                          setRowError(null);
                          onUpdated(saved.entry);
                          return;
                        }
                        setRowError(saved.reason);
                      });
                    }}
                  >
                    Guardar cuenta
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {rowError ? <p className="text-xs text-danger">{rowError}</p> : null}
    </div>
  );
}
