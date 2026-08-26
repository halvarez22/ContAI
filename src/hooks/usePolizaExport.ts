/**
 * Orquestación UI exportación póliza (E10.x).
 * Service → Blob download. Sin JSX.
 */

import { useCallback, useMemo, useState } from 'react';
import { logAuditEntry } from '../services/auditService';
import {
  buildPolizaDiarioTxt,
  countPolizaEligible,
} from '../services/polizaExportService';
import {
  AUDIT_POLIZA_EXPORTED,
  type PolizaTxInput,
} from '../types/polizaExport';

export type PolizaExportFeedback = {
  variant: 'success' | 'error' | 'info';
  message: string;
};

export type UsePolizaExportParams = {
  transactions: ReadonlyArray<PolizaTxInput>;
  organizationId: string;
  periodKey: string;
  build?: typeof buildPolizaDiarioTxt;
  downloadTextFile?: (text: string, fileName: string) => void;
  audit?: typeof logAuditEntry;
};

export function downloadTextFileBrowser(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function usePolizaExport(params: UsePolizaExportParams) {
  const {
    transactions,
    organizationId,
    periodKey,
    build = buildPolizaDiarioTxt,
    downloadTextFile = downloadTextFileBrowser,
    audit = logAuditEntry,
  } = params;

  const [feedback, setFeedback] = useState<PolizaExportFeedback | null>(null);

  const eligibleCount = useMemo(
    () => countPolizaEligible(transactions),
    [transactions]
  );

  const exportPoliza = useCallback(() => {
    const result = build({
      transactions,
      organizationId,
      periodKey,
    });

    if (result.ok === false) {
      setFeedback({ variant: 'error', message: result.reason });
      return;
    }

    downloadTextFile(result.text, result.fileName);
    setFeedback({
      variant: 'success',
      message: `Póliza exportada: ${result.eligibleCount} asiento(s), ${result.skipped.length} omitida(s).`,
    });

    void audit(AUDIT_POLIZA_EXPORTED, 'poliza_export', {
      organization_id: organizationId,
      periodo: periodKey,
      elegibles: result.eligibleCount,
      omitidas: result.skipped.length,
      fileName: result.fileName,
    });
  }, [
    build,
    transactions,
    organizationId,
    periodKey,
    downloadTextFile,
    audit,
  ]);

  return {
    eligibleCount,
    exportDisabled: eligibleCount === 0,
    feedback,
    exportPoliza,
    clearFeedback: () => setFeedback(null),
  };
}
