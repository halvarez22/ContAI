/**
 * Descarga del XML de balanza. La regla vive en anexo24BalanzaService.
 */

import { useCallback, useMemo, useState } from 'react';
import { ANEXO24_ROLE_HINT } from '../config/anexo24';
import { logAuditEntry } from '../services/auditService';
import { buildAnexo24Balanza } from '../services/anexo24BalanzaService';
import { balanzaToXml } from '../services/anexo24BalanzaXml';
import { AUDIT_BALANZA_ANEXO24_EXPORTADA } from '../types/anexo24Balanza';
import type { Anexo24BalanzaResult } from '../types/anexo24Balanza';
import type { TrialBalanceReport } from '../types/financialReports';

export type UseAnexo24BalanzaExportParams = {
  trialBalance: TrialBalanceReport;
  organizationId?: string;
  organizationRfc: string;
  year: number;
  monthIndex: number;
  canWrite: boolean;
  audit?: typeof logAuditEntry;
  downloadTextFile?: (text: string, fileName: string) => void;
};

function downloadXmlFile(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'application/xml;charset=utf-8' });
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

export function useAnexo24BalanzaExport(params: UseAnexo24BalanzaExportParams) {
  const {
    trialBalance,
    organizationId,
    organizationRfc,
    year,
    monthIndex,
    canWrite,
    audit = logAuditEntry,
    downloadTextFile = downloadXmlFile,
  } = params;
  const [feedback, setFeedback] = useState<string | null>(null);

  const result: Anexo24BalanzaResult = useMemo(
    () => buildAnexo24Balanza({ organizationRfc, year, monthIndex, trialBalance }),
    [monthIndex, organizationRfc, trialBalance, year]
  );

  const disabledReason = !canWrite
    ? ANEXO24_ROLE_HINT
    : !organizationId
      ? 'Elige una organización'
      : result.ok
        ? null
        : result.reason;

  const download = useCallback(async () => {
    if (!canWrite || !organizationId || result.ok === false) return;
    try {
      const file = balanzaToXml(result);
      downloadTextFile(file.text, file.fileName);
      await audit(AUDIT_BALANZA_ANEXO24_EXPORTADA, 'organizations', {
        organization_id: organizationId,
        periodo: result.periodo,
        cuentas_incluidas: result.cuentas.length,
      });
      setFeedback('XML de balanza descargado.');
    } catch (error: unknown) {
      setFeedback(
        error instanceof Error
          ? 'No se pudo generar el XML de la balanza.'
          : 'No se pudo generar el XML de la balanza.'
      );
    }
  }, [audit, canWrite, downloadTextFile, organizationId, result]);

  return { result, feedback, disabledReason, download };
}
