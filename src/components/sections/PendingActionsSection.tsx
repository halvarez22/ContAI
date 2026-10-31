import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatCurrency } from '../../lib/utils';
import type {
  PendingActionCategory,
  PendingActionItem,
  PendingActionsReport,
} from '../../types/pendingActions';

const EMPTY_COPY = 'No hay acciones pendientes para este periodo. ¡Todo en orden!';

const CATEGORY_ORDER: readonly PendingActionCategory[] = [
  'in_review',
  'missing_account',
  'pending_reconciliation',
];

const CATEGORY_LABEL: Record<PendingActionCategory, string> = {
  in_review: 'En revisión',
  missing_account: 'Falta cuenta',
  pending_reconciliation: 'Pendiente de conciliar',
};

const BADGE_VARIANT: Record<PendingActionCategory, 'warning' | 'info' | 'default'> = {
  in_review: 'warning',
  missing_account: 'info',
  pending_reconciliation: 'default',
};

const ACTION_LABEL: Record<PendingActionCategory, string> = {
  in_review: 'Revisar',
  missing_account: 'Abrir movimiento',
  pending_reconciliation: 'Conciliar',
};

export type PendingActionsSectionProps = {
  report: PendingActionsReport;
  onOpenTransaction: (id: string) => void;
  onReview: () => void;
  onReconcile: () => void;
};

function formatPendingDate(fecha: string): string {
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return fecha;
  return parsed.toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

function goToPending(
  item: PendingActionItem,
  onOpenTransaction: (id: string) => void,
  onReview: () => void,
  onReconcile: () => void
): void {
  if (item.category === 'in_review') {
    onReview();
    return;
  }
  if (item.category === 'missing_account') {
    onOpenTransaction(item.id);
    return;
  }
  onReconcile();
}

export function PendingActionsSection({
  report,
  onOpenTransaction,
  onReview,
  onReconcile,
}: PendingActionsSectionProps) {
  return (
    <Card className="p-4 lg:p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-bold text-ink">Pendientes del periodo</h2>
        <p className="text-xs text-ink-muted">
          Movimientos de este mes que todavía piden una acción. Cada botón abre la pantalla donde se resuelve.
        </p>
      </div>

      {report.summary.total === 0 ? (
        <p className="text-sm text-ink py-4 text-center">{EMPTY_COPY}</p>
      ) : (
        <div className="space-y-5">
          {CATEGORY_ORDER.map((category) => {
            const rows = report.items.filter((item) => item.category === category);
            if (rows.length === 0) return null;
            return (
              <section key={category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    {CATEGORY_LABEL[category]}
                  </h3>
                  <Badge variant={BADGE_VARIANT[category]}>{rows.length}</Badge>
                </div>
                <ul className="divide-y divide-border">
                  {rows.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-ink truncate">{item.concepto}</p>
                        <p className="text-xs text-ink-muted">
                          {formatPendingDate(item.fecha)} · {item.reason}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:shrink-0">
                        <span className="font-mono text-sm text-ink tabular-nums">
                          {formatCurrency(item.monto)}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          className="text-xs py-1 px-3"
                          onClick={() =>
                            goToPending(item, onOpenTransaction, onReview, onReconcile)
                          }
                        >
                          {ACTION_LABEL[item.category]}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
