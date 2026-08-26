/**
 * Orquestación UI de carga de lista 69-B (E11.1 UI).
 * Gate canUpload; estados idle → uploading → processing → success | error.
 * Sin JSX. Persistencia solo vía fiscalRiskService.
 */

import { useCallback, useState } from 'react';
import { FISCAL_RISK_COPY, type FiscalRiskIndex } from '../types/fiscalRisk';
import type { FiscalRiskParseError } from '../types/fiscalRisk';
import {
  loadFiscalRiskIndex,
  parseFiscalRiskCsv,
  parseFiscalRiskXlsxBuffer,
  upsertFiscalRiskListVersioned,
} from '../services/fiscalRiskService';

export type FiscalRiskUploadPhase =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'success'
  | 'error';

export type FiscalRiskUploadFeedback = {
  variant: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

export type UseFiscalRiskListParams = {
  organizationId: string;
  userId: string;
  canUpload: boolean;
  onPublished?: (index: FiscalRiskIndex) => void;
  upsert?: typeof upsertFiscalRiskListVersioned;
  loadIndex?: typeof loadFiscalRiskIndex;
  confirmReplace?: () => boolean;
};

function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv');
}

export function useFiscalRiskList(params: UseFiscalRiskListParams) {
  const {
    organizationId,
    userId,
    canUpload,
    onPublished,
    upsert = upsertFiscalRiskListVersioned,
    loadIndex = loadFiscalRiskIndex,
    confirmReplace = () =>
      typeof window !== 'undefined'
        ? window.confirm(FISCAL_RISK_COPY.confirmReplace)
        : true,
  } = params;

  const [phase, setPhase] = useState<FiscalRiskUploadPhase>('idle');
  const [feedback, setFeedback] = useState<FiscalRiskUploadFeedback | null>(null);
  const [parseErrors, setParseErrors] = useState<FiscalRiskParseError[]>([]);
  const [lastVersion, setLastVersion] = useState<string | null>(null);
  const [lastRfcCount, setLastRfcCount] = useState<number | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setFeedback(null);
    setParseErrors([]);
  }, []);

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!canUpload) {
        setPhase('error');
        setFeedback({
          variant: 'error',
          message: 'No tienes permiso para publicar la lista 69-B.',
        });
        return;
      }
      if (!file) return;

      if (!isCsvFile(file) && !isSpreadsheetFile(file)) {
        setPhase('error');
        setFeedback({
          variant: 'error',
          message: 'Formato no soportado. Usa .csv, .xlsx o .xls.',
        });
        setParseErrors([]);
        return;
      }

      if (!confirmReplace()) {
        setPhase('idle');
        setFeedback(null);
        return;
      }

      setPhase('uploading');
      setFeedback({
        variant: 'info',
        message: 'Leyendo archivo…',
      });
      setParseErrors([]);

      try {
        let parseResult;
        if (isCsvFile(file)) {
          const text = await file.text();
          parseResult = parseFiscalRiskCsv(text);
        } else {
          const buf = await file.arrayBuffer();
          parseResult = parseFiscalRiskXlsxBuffer(buf);
        }

        if (parseResult.entries.length === 0) {
          setPhase('error');
          setParseErrors(parseResult.errors);
          setFeedback({
            variant: 'error',
            message:
              parseResult.errors[0]?.message ??
              'No se obtuvieron RFCs válidos del archivo.',
          });
          return;
        }

        setPhase('processing');
        setFeedback({
          variant: 'info',
          message: 'Publicando lista (versión)…',
        });
        if (parseResult.errors.length > 0) {
          setParseErrors(parseResult.errors);
        }

        const { version, rfcCount } = await upsert({
          organizationId,
          userId,
          fileName: file.name,
          entries: parseResult.entries,
          publishedAtLabel: parseResult.publishedAtHint,
        });

        const index = await loadIndex(organizationId);
        setLastVersion(version);
        setLastRfcCount(rfcCount);
        setPhase('success');
        setFeedback({
          variant: 'success',
          message: `Lista publicada: ${rfcCount} RFC(s), versión ${version}.`,
        });
        if (index) {
          onPublished?.(index);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Error al publicar la lista 69-B.';
        setPhase('error');
        setFeedback({ variant: 'error', message: msg });
      }
    },
    [
      canUpload,
      confirmReplace,
      organizationId,
      userId,
      upsert,
      loadIndex,
      onPublished,
    ]
  );

  return {
    phase,
    feedback,
    parseErrors,
    lastVersion,
    lastRfcCount,
    handleFile,
    reset,
    canUpload,
    uploadHint: FISCAL_RISK_COPY.uploadHint,
  };
}
