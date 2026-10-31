/**
 * Descarga del XML de pólizas. La regla vive en anexo24PolizaService.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ANEXO24_BLOCKED_HINT, ANEXO24_ROLE_HINT } from '../config/anexo24';
import { logAuditEntry } from '../services/auditService';
import { buildAnexo24Polizas } from '../services/anexo24PolizaService';
import { polizasToXml } from '../services/anexo24PolizaXml';
import { listPaymentApplicationsForOrganization } from '../services/paymentApplicationService';
import { AUDIT_POLIZAS_ANEXO24_EXPORTADAS } from '../types/anexo24Polizas';
import type { Anexo24Application, Anexo24Movement, Anexo24PolizaResult } from '../types/anexo24Polizas';
import type { CatalogAccount } from '../types/chartOfAccounts';

export type UseAnexo24PolizaExportParams = {
  movements: readonly Anexo24Movement[];
  chart: readonly CatalogAccount[];
  organizationId?: string;
  organizationRfc: string;
  year: number;
  monthIndex: number;
  canWrite: boolean;
  loadApplications?: (organizationId: string) => Promise<Anexo24Application[]>;
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

export function useAnexo24PolizaExport(params: UseAnexo24PolizaExportParams) {
  const {
    movements,
    chart,
    organizationId,
    organizationRfc,
    year,
    monthIndex,
    canWrite,
    loadApplications = listPaymentApplicationsForOrganization,
    audit = logAuditEntry,
    downloadTextFile = downloadXmlFile,
  } = params;
  const [applications, setApplications] = useState<Anexo24Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setApplications([]);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadApplications(organizationId)
      .then((rows) => {
        if (!cancelled) setApplications(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setApplications([]);
        setLoadError(error instanceof Error ? 'No se pudieron leer las aplicaciones de pago.' : 'No se pudieron leer las aplicaciones de pago.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadApplications, organizationId]);

  const result: Anexo24PolizaResult | null = useMemo(() => {
    if (loading || loadError) return null;
    return buildAnexo24Polizas({
      organizationRfc,
      year,
      monthIndex,
      chart,
      movements,
      applications,
    });
  }, [applications, chart, loadError, loading, monthIndex, movements, organizationRfc, year]);

  const disabledReason = !canWrite
    ? ANEXO24_ROLE_HINT
    : !organizationId
      ? 'Elige una organización'
      : loadError
        ? loadError
        : loading || !result
          ? 'Cargando aplicaciones de pago…'
          : result.ok
            ? null
            : result.blocked.length > 0
              ? ANEXO24_BLOCKED_HINT
              : result.reason;

  const download = useCallback(async () => {
    if (!canWrite || !organizationId || !result || result.ok === false) return;
    try {
      const file = polizasToXml(result);
      downloadTextFile(file.text, file.fileName);
      await audit(AUDIT_POLIZAS_ANEXO24_EXPORTADAS, 'transactions', {
        organization_id: organizationId,
        periodKey: result.periodKey,
        exported_count: result.polizas.length,
        blocked_count: 0,
      });
      setFeedback('XML de pólizas descargado.');
    } catch (error: unknown) {
      setFeedback(error instanceof Error ? 'No se pudo generar el XML de pólizas.' : 'No se pudo generar el XML de pólizas.');
    }
  }, [audit, canWrite, downloadTextFile, organizationId, result]);

  return { result, loading, loadError, feedback, disabledReason, download };
}
