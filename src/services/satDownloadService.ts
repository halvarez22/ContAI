/**
 * Orquestación descarga SAT E6.1: validar request → provider → packages batch.
 * Sin React. Sin FIEL/CSD. Sin fetch al SAT.
 */

import type {
  SatCfdiPackage,
  SatDownloadProvider,
  SatDownloadRequest,
  SatDownloadResult,
  SatDownloadValidationError,
} from '../types/satDownload';
import { mockSatDownloadProvider } from './providers/mockSatDownloadProvider';
import { logAuditEntry } from './auditService';

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateSatDownloadRequest(
  req: SatDownloadRequest
): SatDownloadValidationError[] {
  const errors: SatDownloadValidationError[] = [];
  const rfc = req.rfc?.trim() ?? '';
  if (!rfc) {
    errors.push({ field: 'rfc', message: 'RFC requerido.' });
  } else if (!RFC_RE.test(rfc)) {
    errors.push({ field: 'rfc', message: 'RFC con formato inválido.' });
  }

  if (!DATE_RE.test(req.fechaInicio)) {
    errors.push({
      field: 'fechaInicio',
      message: 'fechaInicio debe ser YYYY-MM-DD.',
    });
  }
  if (!DATE_RE.test(req.fechaFin)) {
    errors.push({ field: 'fechaFin', message: 'fechaFin debe ser YYYY-MM-DD.' });
  }

  if (
    DATE_RE.test(req.fechaInicio) &&
    DATE_RE.test(req.fechaFin) &&
    req.fechaFin < req.fechaInicio
  ) {
    errors.push({
      field: 'rango',
      message: 'fechaFin no puede ser anterior a fechaInicio.',
    });
  }

  return errors;
}

export function packagesToBatchInputs(
  packages: SatCfdiPackage[]
): Array<{ fileName: string; xmlText: string }> {
  return packages.map((p) => ({ fileName: p.fileName, xmlText: p.xmlText }));
}

export async function requestSatDownload(
  req: SatDownloadRequest,
  provider: SatDownloadProvider = mockSatDownloadProvider
): Promise<SatDownloadResult> {
  const validation = validateSatDownloadRequest(req);
  if (validation.length > 0) {
    return {
      ok: false,
      packages: [],
      provider: provider.id,
      errors: validation.map((e) => e.message),
      message: 'Solicitud inválida.',
    };
  }

  await logAuditEntry('SAT_DOWNLOAD_REQUESTED', 'sat_download', {
    rfc: req.rfc.trim().toUpperCase(),
    fechaInicio: req.fechaInicio,
    fechaFin: req.fechaFin,
    tipo: req.tipo,
    provider: provider.id,
  });

  const result = await provider.download({
    ...req,
    rfc: req.rfc.trim().toUpperCase(),
  });

  await logAuditEntry('SAT_DOWNLOAD_COMPLETED', 'sat_download', {
    provider: result.provider,
    ok: result.ok,
    count: result.packages.length,
    message: result.message,
    errors: result.errors,
  });

  return result;
}
