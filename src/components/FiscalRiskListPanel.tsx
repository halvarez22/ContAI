/**
 * UI de carga de lista 69-B (E11.1). Solo presentacional + hook.
 * El padre decide si montar el panel (gate canManageOrg).
 */

import { useRef } from 'react';
import { ShieldAlert, Upload } from 'lucide-react';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FISCAL_RISK_COPY } from '../types/fiscalRisk';
import type { FiscalRiskIndex } from '../types/fiscalRisk';
import { useFiscalRiskList } from '../hooks/useFiscalRiskList';

const MAX_VISIBLE_ERRORS = 8;

export type FiscalRiskListPanelProps = {
  organizationId: string;
  userId: string;
  canUpload: boolean;
  onPublished?: (index: FiscalRiskIndex) => void;
};

export function FiscalRiskListPanel({
  organizationId,
  userId,
  canUpload,
  onPublished,
}: FiscalRiskListPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    phase,
    feedback,
    parseErrors,
    handleFile,
    uploadHint,
  } = useFiscalRiskList({
    organizationId,
    userId,
    canUpload,
    onPublished,
  });

  const busy = phase === 'uploading' || phase === 'processing';

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-ink flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-brand" />
          Lista de riesgo fiscal 69-B
        </p>
        <p className="text-xs text-ink-muted mt-1">{uploadHint}</p>
        <p className="text-xs text-ink-subtle mt-1">{FISCAL_RISK_COPY.confirmReplace}</p>
      </div>

      {feedback ? (
        <Alert
          variant={feedback.variant}
          title={feedback.variant === 'success' ? 'Lista actualizada' : undefined}
        >
          {feedback.message}
        </Alert>
      ) : null}

      {parseErrors.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-ink-muted space-y-1">
          <p className="font-semibold text-ink">
            Filas con observación ({parseErrors.length})
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            {parseErrors.slice(0, MAX_VISIBLE_ERRORS).map((e) => (
              <li key={`${e.row}-${e.message}`}>
                Fila {e.row}: {e.message}
              </li>
            ))}
          </ul>
          {parseErrors.length > MAX_VISIBLE_ERRORS ? (
            <p className="text-ink-subtle">
              … y {parseErrors.length - MAX_VISIBLE_ERRORS} más
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          disabled={busy || !canUpload}
          className="sr-only"
          aria-label="Cargar lista 69-B CSV o Excel"
          onChange={(e) => {
            const f = e.target.files?.[0];
            void handleFile(f);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !canUpload}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          {busy
            ? phase === 'uploading'
              ? 'Leyendo…'
              : 'Publicando…'
            : 'Cargar CSV / Excel'}
        </Button>
        <p className="text-[10px] text-ink-subtle">
          Formatos: .csv, .xlsx, .xls · columna RFC (headers tolerantes a acentos/puntos)
        </p>
      </div>
    </div>
  );
}
