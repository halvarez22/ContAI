/**
 * Máquina de estados del job de descarga SAT (E6.2).
 * Depende de SatWsClient inyectable (Mock en CI).
 */

import type {
  SatCfdiPackage,
  SatDownloadJob,
  SatDownloadJobStatus,
  SatDownloadRequest,
  SatJobErrorCode,
} from '../contracts';
import type { SatWsClient } from './satWsClient';
import { unpackSatPackageBuffer } from './zipUnpack';

export type JobStore = {
  get(jobId: string): Promise<SatDownloadJob | null>;
  set(job: SatDownloadJob): Promise<void>;
};

const MAX_VERIFY_ATTEMPTS = 30;

export async function createQueuedJob(params: {
  jobId: string;
  organizationId: string;
  userId: string;
  request: SatDownloadRequest;
  provider: 'mock_ws' | 'sat_ws';
}): Promise<SatDownloadJob> {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  return {
    id: params.jobId,
    organization_id: params.organizationId,
    usuario_id: params.userId,
    request: params.request,
    status: 'queued',
    attempts: 0,
    provider: params.provider,
    created_at: now,
    updated_at: now,
    expires_at: expires,
  };
}

export async function runSatDownloadJob(params: {
  jobId: string;
  store: JobStore;
  ws: SatWsClient;
  maxVerifyAttempts?: number;
}): Promise<SatDownloadJob> {
  const { jobId, store, ws } = params;
  const maxVerify = params.maxVerifyAttempts ?? MAX_VERIFY_ATTEMPTS;

  let job = await store.get(jobId);
  if (!job) {
    throw new Error(`Job no encontrado: ${jobId}`);
  }

  const patch = async (
    status: SatDownloadJobStatus,
    extra: Partial<SatDownloadJob> = {}
  ) => {
    job = {
      ...job!,
      ...extra,
      status,
      updated_at: new Date().toISOString(),
      attempts: (job?.attempts ?? 0) + (extra.attempts !== undefined ? 0 : 0),
    };
    // attempts: increment on verify loops separately
    await store.set(job);
    return job;
  };

  try {
    await patch('soliciting');
    const { requestId } = await ws.solicitar({
      rfc: job.request.rfc,
      fechaInicio: job.request.fechaInicio,
      fechaFin: job.request.fechaFin,
      tipo: job.request.tipo,
    });
    job = await patch('verifying', { sat_request_id: requestId });

    let packageIds: string[] = [];
    for (let i = 0; i < maxVerify; i++) {
      job = {
        ...job,
        attempts: i + 1,
        updated_at: new Date().toISOString(),
      };
      await store.set(job);

      const ver = await ws.verificar(requestId);
      if (ver.state === 'Error' || ver.state === 'Rechazada') {
        return fail(store, job, 'SAT_REJECTED', `SAT estado: ${ver.state}`);
      }
      if (ver.state === 'Terminada') {
        packageIds = ver.packageIds;
        break;
      }
      if (i === maxVerify - 1) {
        return fail(store, job, 'SAT_TIMEOUT', 'Timeout verificando solicitud SAT');
      }
    }

    if (packageIds.length === 0) {
      return fail(store, job, 'SAT_EMPTY', 'SAT no devolvió paquetes');
    }

    job = await patch('downloading', { sat_package_ids: packageIds });

    const allPackages: SatCfdiPackage[] = [];
    for (const pkgId of packageIds) {
      const buf = await ws.descargar(pkgId);
      job = await patch('unpacking');
      const part = await unpackSatPackageBuffer(buf);
      allPackages.push(...part);
    }

    if (allPackages.length === 0) {
      return fail(store, job, 'SAT_EMPTY', 'Paquetes sin XML');
    }

    job = await patch('ready', {
      packages: allPackages,
      package_count: allPackages.length,
      error_code: undefined,
      error_message: undefined,
    });
    return job;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return fail(store, job, 'INTERNAL', msg);
  }
}

async function fail(
  store: JobStore,
  job: SatDownloadJob,
  code: SatJobErrorCode,
  message: string
): Promise<SatDownloadJob> {
  const next: SatDownloadJob = {
    ...job,
    status: 'failed',
    error_code: code,
    error_message: message,
    updated_at: new Date().toISOString(),
  };
  await store.set(next);
  return next;
}

/** Rate limit: max N jobs created in the last hour for org. */
export function isRateLimited(
  recentJobTimestamps: string[],
  maxPerHour: number,
  nowMs = Date.now()
): boolean {
  const hourAgo = nowMs - 3600_000;
  const count = recentJobTimestamps.filter((t) => {
    const ms = Date.parse(t);
    return Number.isFinite(ms) && ms >= hourAgo;
  }).length;
  return count >= maxPerHour;
}
