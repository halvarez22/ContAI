import { Percent, PieChart } from 'lucide-react';
import { Card } from './ui/Card';
import { StatCard } from './ui/StatCard';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { formatCurrency } from '../lib/utils';
import type { TaxPreview } from '../types/taxPreview';

type Variant = 'compact' | 'detailed';

export function TaxPreviewCard({
  preview,
  variant = 'compact',
}: {
  preview: TaxPreview;
  variant?: Variant;
}) {
  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          label="IVA del periodo (informativo)"
          value={formatCurrency(preview.iva.saldoNeto)}
          tone="brand"
          hint={`Trasladado ${formatCurrency(preview.iva.trasladado)} · Acreditable ${formatCurrency(preview.iva.acreditable)}`}
          delta={
            preview.iva.lineasSinDesglose > 0
              ? `${preview.iva.lineasSinDesglose} mov. sin tasa IVA`
              : undefined
          }
        />
        <StatCard
          label="ISR estimado (YTD, aprox.)"
          value={formatCurrency(preview.isr.isrEstimado)}
          tone="default"
          hint={`Base ${formatCurrency(preview.isr.baseGravableYtd)} · ${preview.isr.nota}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
          <Percent className="w-5 h-5 text-brand" />
          IVA del mes
          <Badge variant="info">Informativo</Badge>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="IVA trasladado"
            value={formatCurrency(preview.iva.trasladado)}
            tone="success"
          />
          <StatCard
            label="IVA acreditable"
            value={formatCurrency(preview.iva.acreditable)}
            tone="warning"
          />
          <StatCard
            label="Saldo neto"
            value={formatCurrency(preview.iva.saldoNeto)}
            tone="brand"
          />
        </div>
        {Object.keys(preview.iva.porTasaIngreso).length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-bold text-ink-muted mb-2">Por tasa (ingresos)</p>
            <ul className="text-xs space-y-1 font-mono tabular-nums text-ink">
              {Object.entries(preview.iva.porTasaIngreso).map(([k, v]) => (
                <li key={k}>
                  {k}: base {formatCurrency(v.subtotal)} · IVA {formatCurrency(v.iva)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {preview.iva.lineasSinDesglose > 0 && (
          <Alert variant="warning" className="mt-3" title="Movimientos sin desglose IVA">
            {preview.iva.lineasSinDesglose} movimiento(s) con tasa &quot;N/A&quot; — no entran en el
            cuadre IVA.
          </Alert>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-brand" />
          ISR (estimación anual sobre acumulado YTD)
        </h3>
        <div className="space-y-2 text-sm text-ink">
          <p>
            <span className="text-ink-muted">Ingresos acumulables (subtotal):</span>{' '}
            <strong className="font-mono tabular-nums">
              {formatCurrency(preview.isr.ingresosAcumulablesYtd)}
            </strong>
          </p>
          <p>
            <span className="text-ink-muted">Deducciones (egresos deducibles, subtotal):</span>{' '}
            <strong className="font-mono tabular-nums">
              {formatCurrency(preview.isr.deduccionesYtd)}
            </strong>
          </p>
          <p>
            <span className="text-ink-muted">Base gravable:</span>{' '}
            <strong className="font-mono tabular-nums">
              {formatCurrency(preview.isr.baseGravableYtd)}
            </strong>
          </p>
          <p>
            <span className="text-ink-muted">ISR estimado:</span>{' '}
            <strong className="text-lg text-brand font-mono tabular-nums">
              {formatCurrency(preview.isr.isrEstimado)}
            </strong>
          </p>
          <p className="text-xs text-ink-muted mt-3">{preview.isr.detalleTramo}</p>
          <p className="text-xs text-ink-muted">
            Factor tarifa: ({preview.isr.mesAplicado + 1}/12) sobre tablas anuales 2024.
          </p>
          <Alert variant="warning" className="mt-2">
            {preview.isr.nota}
          </Alert>
        </div>
      </Card>

      <Alert variant="info" title="Disclaimer">
        <p>{preview.disclaimer}</p>
        <p className="mt-2">
          <strong>Integración IA:</strong> el borrador ejecutivo y el chat del mes incluyen el bloque{' '}
          <code className="text-[10px] font-mono">fiscal</code> en el JSON cuando hay datos. Las tasas
          IVA oficiales vienen del catálogo tipado, no del modelo.
        </p>
      </Alert>
    </div>
  );
}
