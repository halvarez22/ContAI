import { PageHeader } from './ui/PageHeader';
import { StatCard } from './ui/StatCard';
import { Chart } from './ui/Chart';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Skeleton } from './ui/Skeleton';
import { formatCurrency } from '../lib/utils';
import type {
  ExecutiveKpis,
  ExecutiveTrendPoint,
} from '../types/executiveDashboard';

export type ExecutiveDashboardViewProps = {
  kpis: ExecutiveKpis;
  trend: ExecutiveTrendPoint[];
  disclaimer: string;
  briefingLoading: boolean;
  onGenerateBriefing: () => void;
};

export function ExecutiveDashboardView({
  kpis,
  trend,
  disclaimer,
  briefingLoading,
  onGenerateBriefing,
}: ExecutiveDashboardViewProps) {
  const flujoTone =
    kpis.flujoCajaNeto > 0 ? 'success' : kpis.flujoCajaNeto < 0 ? 'danger' : 'default';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vista ejecutiva"
        description={`Resumen macro · ${kpis.periodoLabel}. Datos informativos; no sustituyen declaraciones al SAT.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Ejecutivo</Badge>
            <Button
              type="button"
              onClick={onGenerateBriefing}
              disabled={briefingLoading || kpis.isEmpty}
            >
              {briefingLoading ? 'Generando…' : 'Generar borrador ejecutivo'}
            </Button>
          </div>
        }
      />

      {briefingLoading ? (
        <Card className="p-4 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <p className="text-xs text-ink-muted">Generando borrador con IA…</p>
        </Card>
      ) : null}

      {kpis.isEmpty ? (
        <Alert variant="info" title="Sin movimientos">
          No hay datos para este periodo. Ajusta el mes/año o importa transacciones.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="IVA neto (periodo)"
          value={formatCurrency(kpis.ivaSaldoNeto)}
          tone="brand"
          hint="Trasladado − acreditable"
        />
        <StatCard
          label="Flujo de caja neto"
          value={formatCurrency(kpis.flujoCajaNeto)}
          tone={flujoTone}
          delta={`Ing. ${formatCurrency(kpis.ingresosPeriodo)} · Eg. ${formatCurrency(kpis.egresosPeriodo)}`}
        />
        <StatCard
          label="% conciliado bancario"
          value={`${kpis.pctBankReconciled.toFixed(1)}%`}
          tone={kpis.pctBankReconciled >= 80 ? 'success' : 'warning'}
          hint={`${kpis.bankReconciledCount} de ${kpis.txCount} TX con bank_reconciled`}
        />
        <StatCard
          label="ISR estimado (YTD)"
          value={formatCurrency(kpis.isrEstimadoYtd)}
          tone="default"
          hint="Estimación informativa"
        />
      </div>

      <Card className="p-4 lg:p-6 space-y-3">
        <h2 className="text-sm font-bold text-ink">Tendencia 6 meses</h2>
        {kpis.isEmpty && trend.every((t) => t.ingresos === 0 && t.egresos === 0) ? (
          <Alert variant="info">Sin serie para graficar en la ventana seleccionada.</Alert>
        ) : (
          <Chart
            type="line"
            data={trend}
            xKey="mes"
            series={[
              { dataKey: 'ingresos', name: 'Ingresos' },
              { dataKey: 'egresos', name: 'Egresos' },
            ]}
            height={260}
          />
        )}
      </Card>

      {kpis.warnings
        .filter((w) => !w.includes('No hay datos'))
        .map((w) => (
          <Alert key={w} variant="warning">
            {w}
          </Alert>
        ))}

      <Alert variant="info" title="Disclaimer fiscal">
        {disclaimer}
      </Alert>
    </div>
  );
}
