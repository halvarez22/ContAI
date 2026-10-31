import { useAnexo24CatalogoExport } from '../../hooks/useAnexo24CatalogoExport';
import type { CatalogAccount } from '../../types/chartOfAccounts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export type Anexo24CatalogoCardProps = {
  chart: readonly CatalogAccount[];
  organizationId?: string;
  organizationRfc: string;
  year: number;
  monthIndex: number;
  canWrite: boolean;
};

export function Anexo24CatalogoCard(props: Anexo24CatalogoCardProps) {
  const state = useAnexo24CatalogoExport(props);
  const blocked = state.result.ok === false ? state.result.blocked : [];
  const notices = state.result.notices;

  return (
    <Card className="p-6 space-y-3">
      <div>
        <h3 className="font-bold text-ink">Catálogo de cuentas</h3>
        <p className="text-xs text-ink-muted mt-1">
          XML del catálogo del mes. El archivo queda en este equipo; desde aquí no se envía al SAT.
        </p>
      </div>
      {blocked.map((item) => (
        <p key={`${item.accountCode}-${item.reason}`} className="text-xs text-danger">
          {item.reason}
        </p>
      ))}
      {notices.map((item) => (
        <p key={`${item.accountCode}-${item.reason}`} className="text-xs text-ink-muted">
          {item.accountCode ? `${item.accountCode}: ` : ''}
          {item.reason}
        </p>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={state.disabledReason !== null}
        title={state.disabledReason ?? 'Descarga el XML del catálogo de este periodo'}
        onClick={() => {
          void state.download();
        }}
      >
        Descargar catálogo XML
      </Button>
      {state.disabledReason ? <p className="text-xs text-ink-muted">{state.disabledReason}</p> : null}
      {state.feedback ? <p className="text-xs text-ink-muted">{state.feedback}</p> : null}
    </Card>
  );
}
