import { useState } from 'react';
import { isTransactionDateInClosedPeriod } from '../../lib/periodClose';
import { CLOSED_PERIOD_REASON } from '../../types/batchApproval';
import type { CatalogAccount } from '../../types/chartOfAccounts';
import { RECLASS_CONFIRM_LABEL } from '../../types/reconciledReassignment';
import type { ReconciledReassignmentPatch } from '../../types/reconciledReassignment';
import { useReconciledReassignment } from '../../hooks/useReconciledReassignment';
import { Button } from '../ui/Button';

export type ReconciledReassignmentPanelProps = {
  transactionId: string;
  fecha: string;
  status?: string | null;
  tipo: string;
  monto: number;
  fiscalSubtotal?: number | null;
  fiscalIva?: number | null;
  accountCode?: string | null;
  metodoPagoSat?: string | null;
  concepto?: string | null;
  proveedor?: string | null;
  isNomina?: boolean;
  cfdiTipo?: string | null;
  confidenceScore?: number | null;
  canManage: boolean;
  atajoPueBancos: boolean;
  periodosCerrados: readonly string[];
  chart: readonly CatalogAccount[];
  organizationId?: string;
  actorUserId?: string;
  onUpdated: (patch: ReconciledReassignmentPatch) => void;
};

export function ReconciledReassignmentPanel(props: ReconciledReassignmentPanelProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [nextCode, setNextCode] = useState(props.accountCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const { save, saving } = useReconciledReassignment(props);
  const isTipoP = String(props.cfdiTipo || '').toUpperCase() === 'P';
  const periodClosed = isTransactionDateInClosedPeriod(props.fecha, [...props.periodosCerrados]);
  const visible =
    props.canManage &&
    props.status === 'conciliado' &&
    props.isNomina !== true &&
    !isTipoP;
  const activeAccounts = props.chart.filter((account) => account.activa);
  const ready = confirmed && !periodClosed && nextCode.trim() !== (props.accountCode ?? '').trim();

  if (!visible) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border p-3" aria-label="Reclasificar conciliado">
      <h4 className="text-sm font-bold text-ink">Reclasificar movimiento conciliado</h4>
      {periodClosed ? <p className="text-xs text-ink-muted">{CLOSED_PERIOD_REASON}</p> : null}
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={saving || periodClosed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {RECLASS_CONFIRM_LABEL}
      </label>
      <select
        aria-label="Nueva cuenta del movimiento"
        className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm text-ink"
        value={nextCode}
        disabled={saving || periodClosed}
        onChange={(event) => setNextCode(event.target.value)}
      >
        {activeAccounts.map((account) => (
          <option key={account.code} value={account.code}>
            {account.code} {account.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        disabled={!ready || saving}
        onClick={() => {
          void save(nextCode).then((saved) => {
            if (saved.ok) {
              setError(null);
              setConfirmed(false);
              props.onUpdated(saved.patch);
              return;
            }
            setError(saved.reason);
          });
        }}
      >
        {saving ? 'Reclasificando…' : 'Reclasificar'}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </section>
  );
}
