/**
 * Descarga del XML de catálogo. La regla vive en anexo24CatalogoService.
 */

import { useCallback, useMemo, useState } from 'react';
import { ANEXO24_CATALOGO_BLOCKED_HINT, ANEXO24_ROLE_HINT } from '../config/anexo24';
import { logAuditEntry } from '../services/auditService';
import { buildAnexo24Catalogo } from '../services/anexo24CatalogoService';
import { catalogoToXml } from '../services/anexo24CatalogoXml';
import { AUDIT_CATALOGO_ANEXO24_EXPORTADO } from '../types/anexo24Catalogo';
import type { Anexo24CatalogoResult } from '../types/anexo24Catalogo';
import type { CatalogAccount } from '../types/chartOfAccounts';

export type UseAnexo24CatalogoExportParams = {
  chart: readonly CatalogAccount[];
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

export function useAnexo24CatalogoExport(params: UseAnexo24CatalogoExportParams) {
  const {
    chart,
    organizationId,
    organizationRfc,
    year,
    monthIndex,
    canWrite,
    audit = logAuditEntry,
    downloadTextFile = downloadXmlFile,
  } = params;
  const [feedback, setFeedback] = useState<string | null>(null);

  const result: Anexo24CatalogoResult = useMemo(
    () => buildAnexo24Catalogo({ organizationRfc, year, monthIndex, chart }),
    [chart, monthIndex, organizationRfc, year]
  );

  const disabledReason = !canWrite
    ? ANEXO24_ROLE_HINT
    : !organizationId
      ? 'Elige una organización'
      : result.ok
        ? null
        : result.blocked.length > 0
          ? ANEXO24_CATALOGO_BLOCKED_HINT
          : result.reason;

  const download = useCallback(async () => {
    if (!canWrite || !organizationId || result.ok === false) return;
    try {
      const file = catalogoToXml(result);
      downloadTextFile(file.text, file.fileName);
      await audit(AUDIT_CATALOGO_ANEXO24_EXPORTADO, 'organizations', {
        organization_id: organizationId,
        periodKey: result.periodKey,
        account_count: result.cuentas.length,
        blocked_count: 0,
      });
      setFeedback('XML de catálogo descargado.');
    } catch (error: unknown) {
      setFeedback(
        error instanceof Error
          ? 'No se pudo generar el XML del catálogo.'
          : 'No se pudo generar el XML del catálogo.'
      );
    }
  }, [audit, canWrite, downloadTextFile, organizationId, result]);

  return { result, feedback, disabledReason, download };
}
