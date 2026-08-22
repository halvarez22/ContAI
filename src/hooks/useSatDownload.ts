import { useState, useCallback, useEffect } from 'react';
import {
  packagesToBatchInputs,
  requestSatDownload,
} from '../services/satDownloadService';
import { mockSatDownloadProvider } from '../services/providers/mockSatDownloadProvider';
import { runCfdiBatchImport } from '../services/cfdiBatchImportService';
import type { ClassifyBatchFn } from '../services/cfdiBatchImportService';
import type {
  SatDownloadPhase,
  SatDownloadProvider,
  SatDownloadRequest,
  SatDownloadTipo,
} from '../types/satDownload';
import type { CfdiBatchFileResult, CfdiBatchImportSummary } from '../types/cfdiBatch';

export type UseSatDownloadParams = {
  userId: string | undefined;
  defaultRfc: string;
  periodosCerrados: string[];
  highAmountReviewThreshold: number;
  classify: ClassifyBatchFn;
  provider?: SatDownloadProvider;
};

export function useSatDownload({
  userId,
  defaultRfc,
  periodosCerrados,
  highAmountReviewThreshold,
  classify,
  provider = mockSatDownloadProvider,
}: UseSatDownloadParams) {
  const [phase, setPhase] = useState<SatDownloadPhase>('idle');
  const [rfc, setRfc] = useState(defaultRfc);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [tipo, setTipo] = useState<SatDownloadTipo>('ambos');
  const [message, setMessage] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<CfdiBatchFileResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<CfdiBatchImportSummary | null>(
    null
  );
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  useEffect(() => {
    if (defaultRfc.trim()) setRfc(defaultRfc.trim().toUpperCase());
  }, [defaultRfc]);

  const run = useCallback(async () => {
    if (!userId) {
      setPhase('error');
      setMessage('Debes iniciar sesión para importar CFDIs.');
      return;
    }

    const req: SatDownloadRequest = {
      rfc: rfc.trim() || defaultRfc,
      fechaInicio,
      fechaFin,
      tipo,
    };

    setPhase('requesting');
    setMessage(null);
    setBatchResults([]);
    setBatchSummary(null);
    setProgressLabel('Solicitando descarga (simulación)…');

    try {
      const download = await requestSatDownload(req, provider);
      if (!download.ok) {
        setPhase('error');
        setMessage(
          (download.errors ?? []).join(' · ') ||
            download.message ||
            'Solicitud de descarga inválida.'
        );
        setProgressLabel(null);
        return;
      }

      if (download.packages.length === 0) {
        setPhase('success');
        setMessage(download.message || 'Sin CFDIs en el rango.');
        setProgressLabel(null);
        return;
      }

      setPhase('importing');
      setProgressLabel(
        `Importando ${download.packages.length} CFDI(s) al libro…`
      );

      const summary = await runCfdiBatchImport({
        userId,
        periodosCerrados,
        highAmountReviewThreshold,
        inputs: packagesToBatchInputs(download.packages),
        classify,
        onProgress: (p) => {
          setProgressLabel(
            p.message ||
              `${p.phase} ${p.current}/${p.total}` +
                (p.fileName ? ` · ${p.fileName}` : '')
          );
        },
      });

      setBatchSummary(summary);
      setBatchResults(summary.results);
      const failed = summary.results.filter((r) => !r.ok);
      if (summary.committed === 0 && summary.failed > 0) {
        setPhase('error');
        setMessage(
          `Ningún CFDI se importó. ${summary.failed} archivo(s) con error.`
        );
      } else if (failed.length > 0) {
        setPhase('success');
        setMessage(
          `Importación parcial: ${summary.committed} ok, ${failed.length} con error de estructura/periodo. ${download.message ?? ''}`
        );
      } else {
        setPhase('success');
        setMessage(
          `Importados ${summary.committed} CFDI(s) (${summary.classified} clasificados). ${download.message ?? ''}`
        );
      }
    } catch (e) {
      setPhase('error');
      setMessage(
        e instanceof Error
          ? e.message
          : 'Error al descargar/importar (simulación SAT).'
      );
    } finally {
      setProgressLabel(null);
    }
  }, [
    userId,
    rfc,
    defaultRfc,
    fechaInicio,
    fechaFin,
    tipo,
    provider,
    periodosCerrados,
    highAmountReviewThreshold,
    classify,
  ]);

  return {
    phase,
    rfc,
    setRfc,
    fechaInicio,
    setFechaInicio,
    fechaFin,
    setFechaFin,
    tipo,
    setTipo,
    message,
    batchResults,
    batchSummary,
    progressLabel,
    run,
    providerId: provider.id,
  };
}
