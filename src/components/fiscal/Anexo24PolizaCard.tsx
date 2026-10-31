import { useAnexo24PolizaExport } from '../../hooks/useAnexo24PolizaExport';
import type { Anexo24Movement } from '../../types/anexo24Polizas';
import type { CatalogAccount } from '../../types/chartOfAccounts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export type Anexo24PolizaCardProps = {
  movements: readonly Anexo24Movement[];
  chart: readonly CatalogAccount[];
  organizationId?: string;
  organizationRfc: string;
  year: number;
  monthIndex: number;
  canWrite: boolean;
};

export function Anexo24PolizaCard(props: Anexo24PolizaCardProps) {
  const state = useAnexo24PolizaExport(props);
  const blocked = state.result && state.result.ok === false ? state.result.blocked : [];
  const notices = state.result?.notices ?? [];
  const excluded = state.result?.excluded ?? [];

  return (
    <Card className="p-6 space-y-3">
      <div>
        <h3 className="font-bold text-ink">Pólizas del periodo</h3>
        <p className="text-xs text-ink-muted mt-1">
          XML de pólizas del mes. El archivo queda en este equipo; desde aquí no se envía al SAT.
        </p>
      </div>
      {blocked.map((item) => (
        <p key={`${item.transactionId}-${item.accountCode}-${item.reason}`} className="text-xs text-danger">
          {item.accountCode ? `${item.accountCode}: ` : ''}
          {item.reason}
        </p>
      ))}
      {notices.map((item) => (
        <p key={`${item.transactionId}-${item.reason}`} className="text-xs text-ink-muted">
          {item.reason}
        </p>
      ))}
      {excluded.length > 0 ? (
        <p className="text-xs text-ink-muted">
          {excluded.length === 1
            ? '1 movimiento de este mes no está conciliado y queda fuera del archivo.'
            : `${excluded.length} movimientos de este mes no están conciliados y quedan fuera del archivo.`}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        disabled={state.disabledReason !== null}
        title={state.disabledReason ?? 'Descarga el XML de pólizas de este periodo'}
        onClick={() => {
          void state.download();
        }}
      >
        Descargar pólizas XML
      </Button>
      {state.disabledReason ? <p className="text-xs text-ink-muted">{state.disabledReason}</p> : null}
      {state.feedback ? <p className="text-xs text-ink-muted">{state.feedback}</p> : null}
    </Card>
  );
}
