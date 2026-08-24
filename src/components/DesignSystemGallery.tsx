/**
 * Galería viva del Design System — solo montada en DEV (E0.1).
 */

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { Alert } from './ui/Alert';
import { StatCard } from './ui/StatCard';
import { PageHeader } from './ui/PageHeader';
import { DataTable } from './ui/DataTable';
import { Chart } from './ui/Chart';
import { Skeleton } from './ui/Skeleton';

const sampleChart = [
  { mes: 'Ene', ingresos: 120, egresos: 80 },
  { mes: 'Feb', ingresos: 140, egresos: 90 },
  { mes: 'Mar', ingresos: 110, egresos: 95 },
];

const sampleRows = [
  { id: '1', concepto: 'Renta', monto: 12000 },
  { id: '2', concepto: 'Nómina', monto: 45000 },
];

export function DesignSystemGallery() {
  return (
    <div className="space-y-10 max-w-5xl">
      <PageHeader
        title="Design System ContAI"
        description="Galería DEV (E0.1). No visible en producción. Checklist a11y: focus-visible, contraste tokens, roles en Alert."
        actions={<Badge variant="info">DEV only</Badge>}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">Button</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">Badge / Alert / Input</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>default</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="error">error</Badge>
          <Badge variant="info">info</Badge>
        </div>
        <Alert variant="info" title="Información">
          Mensaje informativo con role=status.
        </Alert>
        <Alert variant="warning" title="Revisión">
          Requiere atención del contador.
        </Alert>
        <Alert variant="error" title="Error">
          Acción fallida.
        </Alert>
        <div className="max-w-sm">
          <Input label="RFC" name="rfc" placeholder="AAA010101AAA" hint="Solo demo" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">StatCard / Card / Skeleton</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="IVA neto" value="$12,450.00" tone="brand" hint="Periodo actual" />
          <StatCard label="Conciliado" value="87%" tone="success" delta="+4 pts" />
          <StatCard label="Pendientes" value="12" tone="warning" />
        </div>
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Card de superficie.</p>
          <Skeleton className="h-3 w-2/3 mt-3" />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">DataTable / Chart</h2>
        <DataTable
          columns={[
            { id: 'c', header: 'Concepto', cell: (r) => r.concepto },
            {
              id: 'm',
              header: 'Monto',
              mono: true,
              cell: (r) => r.monto.toLocaleString('es-MX'),
            },
          ]}
          rows={sampleRows}
          rowKey={(r) => r.id}
        />
        <Card className="p-4">
          <Chart
            type="line"
            data={sampleChart}
            xKey="mes"
            series={[
              { dataKey: 'ingresos', name: 'Ingresos' },
              { dataKey: 'egresos', name: 'Egresos' },
            ]}
          />
        </Card>
      </section>
    </div>
  );
}
