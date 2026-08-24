import { Upload, Download, Plus, ArrowRight, Receipt } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { StatCard } from './ui/StatCard';
import { DataTable } from './ui/DataTable';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { formatCurrency } from '../lib/utils';
import type { OperationalSnapshot, OperationalTaskKind } from '../types/operationalDashboard';
import { OPERATIONAL_MAX_TASKS } from '../types/operationalDashboard';

const KIND_BADGE: Record<
  OperationalTaskKind,
  'warning' | 'error' | 'info' | 'default'
> = {
  revision: 'warning',
  high_risk: 'error',
  pending: 'info',
  unclassified: 'default',
};

const KIND_SHORT: Record<OperationalTaskKind, string> = {
  revision: 'Revisión',
  high_risk: 'Riesgo',
  pending: 'Pendiente',
  unclassified: 'Sin cuenta',
};

export type OperationalDashboardViewProps = {
  snapshot: OperationalSnapshot;
  maxTasksShown?: number;
  onNavigateTab: (tabId: string) => void;
  onOpenManualTx: () => void;
  onOpenCfdiImport: () => void;
  onOpenExcelImport: () => void;
  onTaskAction: (taskId: string) => void;
};

export function OperationalDashboardView({
  snapshot,
  maxTasksShown = OPERATIONAL_MAX_TASKS,
  onNavigateTab,
  onOpenManualTx,
  onOpenCfdiImport,
  onOpenExcelImport,
  onTaskAction,
}: OperationalDashboardViewProps) {
  const { counts, tasks, alerts, periodoLabel } = snapshot;
  const showCapHint = counts.totalTasks > maxTasksShown;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vista operativa"
        description={`Tareas del periodo · ${periodoLabel}`}
        actions={<Badge variant="info">Operativo</Badge>}
      />

      {alerts.map((a, i) => (
        <Alert key={`${a.title ?? 'alert'}-${i}`} variant={a.variant} title={a.title}>
          {a.body}
        </Alert>
      ))}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="En revisión"
          value={String(counts.revision)}
          tone={counts.revision > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Pendientes"
          value={String(counts.pending)}
          tone={counts.pending > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Sin clasificar"
          value={String(counts.unclassified)}
          tone={counts.unclassified > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Conciliado bancario"
          value={`${snapshot.pctBankReconciled.toFixed(1)}%`}
          tone={snapshot.pctBankReconciled >= 80 ? 'success' : 'warning'}
          hint={`${snapshot.bankReconciledCount} de ${snapshot.txCount} TX`}
        />
      </div>

      <Card className="p-4 lg:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-ink">Cola de tareas</h2>
            <p className="text-xs text-ink-muted">
              Total: {counts.totalTasks} tarea(s)
              {showCapHint
                ? ` · Mostrando las ${maxTasksShown} más urgentes`
                : null}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => onNavigateTab('transactions')}>
            Ver transacciones
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {tasks.length === 0 ? (
          <p className="text-sm text-ink-muted py-4 text-center">
            {snapshot.hasTransactions
              ? 'No hay tareas que requieran acción.'
              : 'Importa o captura movimientos para este periodo.'}
          </p>
        ) : (
          <DataTable
            columns={[
              {
                id: 'kind',
                header: 'Tipo',
                cell: (row) => (
                  <Badge variant={KIND_BADGE[row.kind]}>{KIND_SHORT[row.kind]}</Badge>
                ),
              },
              {
                id: 'title',
                header: 'Concepto',
                cell: (row) => (
                  <div>
                    <p className="font-medium text-ink truncate max-w-[200px]">{row.title}</p>
                    <p className="text-[10px] text-ink-subtle truncate max-w-[220px]">
                      {row.subtitle}
                    </p>
                  </div>
                ),
              },
              {
                id: 'amount',
                header: 'Monto',
                mono: true,
                cell: (row) =>
                  row.amount != null ? formatCurrency(row.amount) : '—',
              },
              {
                id: 'action',
                header: 'Acción',
                className: 'text-right',
                cell: (row) => (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs py-1 px-2"
                    onClick={() => onTaskAction(row.id)}
                  >
                    Abrir
                  </Button>
                ),
              },
            ]}
            rows={tasks}
            rowKey={(r) => r.id}
            emptyMessage="Sin tareas"
          />
        )}
      </Card>

      <Card className="p-4 lg:p-6 space-y-3">
        <h2 className="text-sm font-bold text-ink">Acciones rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Button type="button" className="justify-start" onClick={onOpenManualTx}>
            <Plus className="w-4 h-4" />
            Capturar transacción
          </Button>
          <Button type="button" variant="secondary" className="justify-start" onClick={onOpenCfdiImport}>
            <Upload className="w-4 h-4" />
            Importar CFDI
          </Button>
          <Button type="button" variant="secondary" className="justify-start" onClick={onOpenExcelImport}>
            <Upload className="w-4 h-4" />
            Importar Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="justify-start"
            onClick={() => onNavigateTab('reconciliation')}
          >
            <Receipt className="w-4 h-4" />
            Conciliación bancaria
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="justify-start"
            onClick={() => onNavigateTab('sat_download')}
          >
            <Download className="w-4 h-4" />
            Descarga SAT
          </Button>
        </div>
      </Card>
    </div>
  );
}
