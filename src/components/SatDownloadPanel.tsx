import { AlertTriangle, Download } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useSatDownload } from '../hooks/useSatDownload';
import type { ClassifyBatchFn } from '../services/cfdiBatchImportService';
import type { SatDownloadProvider } from '../types/satDownload';
import { cn } from '../lib/utils';

export type SatDownloadPanelProps = {
  userId: string | undefined;
  defaultRfc: string;
  periodosCerrados: string[];
  highAmountReviewThreshold: number;
  classify: ClassifyBatchFn;
  provider?: SatDownloadProvider;
};

export function SatDownloadPanel(props: SatDownloadPanelProps) {
  const sat = useSatDownload(props);
  const busy = sat.phase === 'requesting' || sat.phase === 'importing';
  const failed = sat.batchResults.filter((r) => !r.ok);

  return (
    <div className="space-y-4 max-w-3xl">
      <div
        role="alert"
        className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600 px-4 py-3 flex gap-3 items-start"
      >
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-950 dark:text-amber-100 space-y-1">
          <p className="font-bold">Simulación / Beta — sin conexión real al SAT</p>
          <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            Esta pantalla prueba el flujo de ingesta automática. No descarga CFDIs del
            Web Service del SAT ni usa FIEL/CSD. La conexión real llegará en E6.2 con
            un backend seguro.
          </p>
        </div>
      </div>

      <Card className="p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">
            Descarga SAT (Beta)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              RFC
            </label>
            <input
              value={sat.rfc}
              onChange={(e) => sat.setRfc(e.target.value.toUpperCase())}
              className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="AAA010101AAA"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              Fecha inicio
            </label>
            <input
              type="date"
              value={sat.fechaInicio}
              onChange={(e) => sat.setFechaInicio(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              Fecha fin
            </label>
            <input
              type="date"
              value={sat.fechaFin}
              onChange={(e) => sat.setFechaFin(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              disabled={busy}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              Tipo
            </label>
            <select
              value={sat.tipo}
              onChange={(e) =>
                sat.setTipo(e.target.value as 'emitidos' | 'recibidos' | 'ambos')
              }
              className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              disabled={busy}
            >
              <option value="ambos">Emitidos y recibidos</option>
              <option value="emitidos">Solo emitidos</option>
              <option value="recibidos">Solo recibidos</option>
            </select>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={() => void sat.run()}
          disabled={busy || !sat.fechaInicio || !sat.fechaFin}
        >
          {busy
            ? sat.phase === 'requesting'
              ? 'Solicitando (simulación)…'
              : 'Importando al libro…'
            : 'Solicitar descarga e importar'}
        </Button>

        {sat.progressLabel && (
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            {sat.progressLabel}
          </p>
        )}

        {sat.message && (
          <p
            className={cn(
              'text-sm',
              sat.phase === 'error'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-700 dark:text-gray-300'
            )}
          >
            {sat.message}
          </p>
        )}

        {failed.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
              Errores por archivo ({failed.length})
            </p>
            <ul className="text-[11px] font-mono text-amber-900 dark:text-amber-100 space-y-1 max-h-32 overflow-y-auto">
              {failed.map((r) => (
                <li key={r.fileName}>
                  <span className="font-semibold">{r.fileName}</span>: {r.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sat.batchSummary && sat.phase === 'success' && (
          <p className="text-xs text-gray-500">
            Resumen batch — committed: {sat.batchSummary.committed}, classified:{' '}
            {sat.batchSummary.classified}, failed: {sat.batchSummary.failed},
            skippedClosed: {sat.batchSummary.skippedClosed}
          </p>
        )}
      </Card>
    </div>
  );
}
