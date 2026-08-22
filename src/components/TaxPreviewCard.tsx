import { Percent, PieChart } from 'lucide-react';
import { Card } from './ui/Card';
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
        <Card className="p-4 border-indigo-100 dark:border-indigo-900/40">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
              IVA del periodo (informativo)
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Trasladado {formatCurrency(preview.iva.trasladado)} · Acreditable{' '}
            {formatCurrency(preview.iva.acreditable)}
          </p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            Saldo neto IVA: {formatCurrency(preview.iva.saldoNeto)}
          </p>
          {preview.iva.lineasSinDesglose > 0 && (
            <p className="text-[10px] text-amber-600 mt-1">
              {preview.iva.lineasSinDesglose} movimientos sin tasa IVA
            </p>
          )}
        </Card>
        <Card className="p-4 border-indigo-100 dark:border-indigo-900/40">
          <div className="flex items-center gap-2 mb-2">
            <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
              ISR estimado (YTD, aprox.)
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{preview.isr.nota}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            Base {formatCurrency(preview.isr.baseGravableYtd)} → ISR ~
            {formatCurrency(preview.isr.isrEstimado)}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Percent className="w-5 h-5 text-indigo-600" />
          IVA del mes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">IVA trasladado (ingresos)</p>
            <p className="text-xl font-bold text-emerald-600">
              {formatCurrency(preview.iva.trasladado)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">IVA acreditable (egresos)</p>
            <p className="text-xl font-bold text-amber-600">
              {formatCurrency(preview.iva.acreditable)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">Saldo neto del periodo</p>
            <p className="text-xl font-bold text-indigo-600">
              {formatCurrency(preview.iva.saldoNeto)}
            </p>
          </div>
        </div>
        {Object.keys(preview.iva.porTasaIngreso).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-bold text-gray-500 mb-2">Por tasa (ingresos)</p>
            <ul className="text-xs space-y-1 font-mono">
              {Object.entries(preview.iva.porTasaIngreso).map(([k, v]) => (
                <li key={k}>
                  {k}: base {formatCurrency(v.subtotal)} · IVA {formatCurrency(v.iva)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {preview.iva.lineasSinDesglose > 0 && (
          <p className="text-xs text-amber-600 mt-3">
            {preview.iva.lineasSinDesglose} movimiento(s) con tasa &quot;N/A&quot; — no entran en el
            cuadre IVA.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-indigo-600" />
          ISR (estimación anual sobre acumulado YTD)
        </h3>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-gray-500">Ingresos acumulables (subtotal):</span>{' '}
            <strong>{formatCurrency(preview.isr.ingresosAcumulablesYtd)}</strong>
          </p>
          <p>
            <span className="text-gray-500">Deducciones (egresos deducibles, subtotal):</span>{' '}
            <strong>{formatCurrency(preview.isr.deduccionesYtd)}</strong>
          </p>
          <p>
            <span className="text-gray-500">Base gravable:</span>{' '}
            <strong>{formatCurrency(preview.isr.baseGravableYtd)}</strong>
          </p>
          <p>
            <span className="text-gray-500">ISR estimado (tarifa anual art. 152 simplificada):</span>{' '}
            <strong className="text-lg text-indigo-600">
              {formatCurrency(preview.isr.isrEstimado)}
            </strong>
          </p>
          <p className="text-xs text-gray-500 mt-3">{preview.isr.detalleTramo}</p>
          <p className="text-xs text-gray-500">
            Factor tarifa: ({preview.isr.mesAplicado + 1}/12) sobre tablas anuales 2024.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">{preview.isr.nota}</p>
        </div>
      </Card>

      <Card className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/40">
        <p className="text-xs text-gray-600 dark:text-gray-300">{preview.disclaimer}</p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
          <strong>Integración IA:</strong> el borrador ejecutivo y el chat del mes incluyen el bloque{' '}
          <code className="text-[10px]">fiscal</code> en el JSON cuando hay datos. Las tasas IVA
          oficiales vienen del catálogo tipado, no del modelo.
        </p>
      </Card>
    </div>
  );
}
