import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { formatCurrency } from '../lib/utils';
import type { CfdiExtracted } from '../lib/cfdiXml';

export type ImportModalsProps = {
  isCfdiImportOpen: boolean;
  cfdiPreview: CfdiExtracted | null;
  cfdiImportError: string | null;
  cfdiImporting: boolean;
  cfdiXsdMode: string | null;
  cfdiXsdValidating: boolean;
  isExcelImportOpen: boolean;
  excelImportMessage: string | null;
  excelImporting: boolean;
  onCloseCfdi: () => void;
  onCloseExcel: () => void;
  onCfdiFile: (file: File | null) => void;
  onExcelFiles: (files: FileList | null) => void;
  onImportCfdi: () => void;
};

/** UI presentacional de modales CFDI + Excel. Sin Firebase ni lógica de negocio. */
export function ImportModals({
  isCfdiImportOpen,
  cfdiPreview,
  cfdiImportError,
  cfdiImporting,
  cfdiXsdMode,
  cfdiXsdValidating,
  isExcelImportOpen,
  excelImportMessage,
  excelImporting,
  onCloseCfdi,
  onCloseExcel,
  onCfdiFile,
  onExcelFiles,
  onImportCfdi,
}: ImportModalsProps) {
  return (
    <>
      <AnimatePresence>
        {isCfdiImportOpen && (
          <div className="fixed inset-0 z-[76] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cfdiImporting && !cfdiXsdValidating && onCloseCfdi()}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Importar CFDI</h3>
                <button
                  type="button"
                  onClick={() => !cfdiImporting && !cfdiXsdValidating && onCloseCfdi()}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <label className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">Archivo XML</span>
                  <input
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    disabled={cfdiImporting || cfdiXsdValidating}
                    onChange={(e) => onCfdiFile(e.target.files?.[0] || null)}
                    className="text-xs"
                  />
                </label>
                {cfdiXsdValidating && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Validando XML contra XSD…
                  </p>
                )}
                {cfdiImportError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{cfdiImportError}</p>
                )}
                {cfdiPreview && cfdiXsdMode && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Validación XSD: {cfdiXsdMode}
                  </p>
                )}
                {cfdiPreview && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs space-y-1 font-mono bg-gray-50 dark:bg-gray-800/50">
                    <p>
                      <span className="text-gray-500">Tipo:</span> {cfdiPreview.tipoComprobante} ·
                      Total {formatCurrency(cfdiPreview.total)}
                    </p>
                    <p>
                      <span className="text-gray-500">Fecha:</span> {cfdiPreview.fecha}
                    </p>
                    <p>
                      <span className="text-gray-500">UUID:</span> {cfdiPreview.uuid || '—'}
                    </p>
                    <p>
                      <span className="text-gray-500">Emisor:</span> {cfdiPreview.emisorNombre} (
                      {cfdiPreview.emisorRfc})
                    </p>
                    <p>
                      <span className="text-gray-500">Receptor:</span> {cfdiPreview.receptorNombre} (
                      {cfdiPreview.receptorRfc})
                    </p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    type="button"
                    disabled={cfdiImporting || cfdiXsdValidating}
                    onClick={onCloseCfdi}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    type="button"
                    disabled={!cfdiPreview || cfdiImporting || cfdiXsdValidating}
                    onClick={() => onImportCfdi()}
                  >
                    {cfdiImporting ? 'Guardando…' : 'Registrar transacción'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExcelImportOpen && (
          <div className="fixed inset-0 z-[77] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !excelImporting && onCloseExcel()}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Importar Excel</h3>
                <button
                  type="button"
                  onClick={() => !excelImporting && onCloseExcel()}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <p className="text-xs leading-relaxed">
                  Selecciona uno o varios .xlsx (como en{' '}
                  <code className="text-indigo-600 dark:text-indigo-400">data/</code>
                  ): archivo tipo <strong>CARLOS</strong> (hojas ING y EGR),{' '}
                  <strong>control inventarios</strong> (stock menudeo) y{' '}
                  <strong>Utilidad de ventas</strong> (Hoja1). Se crearán transacciones conciliadas y
                  productos; las fechas en periodos cerrados se omiten.
                </p>
                <label className="flex flex-col gap-2">
                  <span className="font-medium">Archivos .xlsx</span>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    multiple
                    disabled={excelImporting}
                    onChange={(e) => {
                      void onExcelFiles(e.target.files);
                      e.target.value = '';
                    }}
                    className="text-xs"
                  />
                </label>
                {excelImporting && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Importando…</p>
                )}
                {excelImportMessage && (
                  <pre className="text-xs whitespace-pre-wrap rounded-lg bg-gray-50 dark:bg-gray-800/80 p-3 text-gray-800 dark:text-gray-200 max-h-48 overflow-y-auto">
                    {excelImportMessage}
                  </pre>
                )}
                <Button
                  variant="secondary"
                  className="w-full"
                  type="button"
                  disabled={excelImporting}
                  onClick={onCloseExcel}
                >
                  Cerrar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
