import { useAnexo24BalanzaExport } from '../../hooks/useAnexo24BalanzaExport';
import type { TrialBalanceReport } from '../../types/financialReports';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export type Anexo24BalanzaCardProps = {
  trialBalance: TrialBalanceReport;
  organizationId?: string;
  organizationRfc: string;
  year: number;
  monthIndex: number;
  canWrite: boolean;
};

export function Anexo24BalanzaCard(props: Anexo24BalanzaCardProps) {
  const state = useAnexo24BalanzaExport(props);
  const blocked = state.result.ok === false ? state.result.blocked : [];

  return (
    <Card className="p-6 space-y-3">
      <div>
        <h3 className="font-bold text-ink">Balanza de comprobación</h3>
        <p className="text-xs text-ink-muted mt-1">
          XML de la balanza del mes. El archivo queda en este equipo; desde aquí no se envía al SAT.
        </p>
      </div>
      {blocked.map((item) => (
        <p key={`${item.accountCode}-${item.reason}`} className="text-xs text-danger">
          {item.reason}
        </p>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={state.disabledReason !== null}
        title={state.disabledReason ?? 'Descarga el XML de la balanza de este periodo'}
        onClick={() => {
          void state.download();
        }}
      >
        Descargar balanza XML
      </Button>
      {state.disabledReason ? <p className="text-xs text-ink-muted">{state.disabledReason}</p> : null}
      {state.feedback ? <p className="text-xs text-ink-muted">{state.feedback}</p> : null}
    </Card>
  );
}
