/**
 * Provider sat_ws — habla con Cloud Functions (E6.2).
 * Polling con backoff exponencial (2s → … → máx 30s).
 * Sin FIEL en el cliente.
 */

import type {
  SatCfdiPackage,
  SatDownloadProvider,
  SatDownloadRequest,
  SatDownloadResult,
} from '../../types/satDownload';
import {
  getSatDownloadJob,
  startSatDownloadJob,
} from '../satFunctionsClient';

const INITIAL_MS = 2000;
const MAX_MS = 30_000;
const MAX_POLLS = 40;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPackagesFromSignedUrl(
  url: string
): Promise<SatCfdiPackage[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo leer packages (HTTP ${res.status})`);
  }
  const data = (await res.json()) as SatCfdiPackage[];
  return Array.isArray(data) ? data : [];
}

export const realSatDownloadProvider: SatDownloadProvider = {
  id: 'sat_ws',

  async download(req: SatDownloadRequest): Promise<SatDownloadResult> {
    try {
      const { jobId } = await startSatDownloadJob(req);
      let delay = INITIAL_MS;

      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(delay);
        const { job, packagesSignedUrl } = await getSatDownloadJob(jobId);

        if (job.status === 'ready') {
          let packages = job.packages ?? [];
          if (packagesSignedUrl && packages.length === 0) {
            packages = await fetchPackagesFromSignedUrl(packagesSignedUrl);
          }
          return {
            ok: true,
            packages,
            provider: 'sat_ws',
            jobId,
            message: `Job ${jobId}: ${packages.length} CFDI(s) listos (backend).`,
          };
        }

        if (job.status === 'failed' || job.status === 'expired') {
          return {
            ok: false,
            packages: [],
            provider: 'sat_ws',
            jobId,
            errors: [
              job.error_message ||
                job.error_code ||
                'Descarga SAT fallida en backend',
            ],
            message: 'Error en job de descarga SAT',
          };
        }

        delay = Math.min(delay * 2, MAX_MS);
      }

      return {
        ok: false,
        packages: [],
        provider: 'sat_ws',
        jobId,
        errors: ['Timeout esperando job SAT'],
        message: 'Timeout de polling',
      };
    } catch (e) {
      return {
        ok: false,
        packages: [],
        provider: 'sat_ws',
        errors: [e instanceof Error ? e.message : 'Error callable SAT'],
        message: 'No se pudo contactar Cloud Functions',
      };
    }
  },
};
