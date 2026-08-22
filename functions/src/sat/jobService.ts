/**
 * Máquina de estados del job de descarga SAT (E6.2 / E6.2.1).
 * Flujo async: solicitarPhase → advanceSatDownloadJob (poll frontend).
 */

import type {
  SatCfdiPackage,
  SatDownloadJob,
  SatDownloadJobStatus,
  SatDownloadRequest,
  SatJobErrorCode,
} from '../contracts';
import type { SatWsClient, SatWsVerifyState } from './satWsClient';
import { unpackSatPackageBuffer } from './zipUnpack';
import {
  isPartialPackageSignal,
  mapSatFailure,
  PARTIAL_PACKAGE_WARNING,
} from './satErrorMap';
import { SatWsClientError } from './realSatWsClient';

export type JobStore = {
  get(jobId: string): Promise<SatDownloadJob | null>;
  set(job: SatDownloadJob): Promise<void>;
};

const MIN_VERIFY_GAP_MS = 2_000;

type VerifyResultExtra = {
  state: SatWsVerifyState;
  packageIds: string[];
  numberCfdis?: number;
  codeRequest?: string;
  message?: string;
  partial?: boolean;
};

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

function tiposForRequest(tipo: string): Array<'emitidos' | 'recibidos'> {
  if (tipo === 'emitidos') return ['emitidos'];
  if (tipo === 'recibidos') return ['recibidos'];
  return ['emitidos', 'recibidos'];
}

async function persist(
  store: JobStore,
  job: SatDownloadJob,
  status: SatDownloadJobStatus,
  extra: Partial<SatDownloadJob> = {}
): Promise<SatDownloadJob> {
  const next: SatDownloadJob = {
    ...job,
    ...extra,
    status,
    updated_at: new Date().toISOString(),
  };
  await store.set(next);
  return next;
}

async function fail(
  store: JobStore,
  job: SatDownloadJob,
  code: SatJobErrorCode,
  message: string
): Promise<SatDownloadJob> {
  return persist(store, job, 'failed', {
    error_code: code,
    error_message: message,
  });
}

function mapCaught(e: unknown): { code: SatJobErrorCode; message: string } {
  if (e instanceof SatWsClientError) {
    return e.mapped;
  }
  const msg = e instanceof Error ? e.message : 'Error interno';
  return mapSatFailure({ kind: 'internal', message: msg });
}

/**
 * Fase 1: crea solicitudes SAT (emitidos y/o recibidos) y deja el job en verifying.
 * No espera Terminada.
 */
export async function solicitarSatDownloadJob(params: {
  jobId: string;
  store: JobStore;
  ws: SatWsClient;
}): Promise<SatDownloadJob> {
  const { jobId, store, ws } = params;
  let job = await store.get(jobId);
  if (!job) throw new Error(`Job no encontrado: ${jobId}`);

  try {
    job = await persist(store, job, 'soliciting');
    const tipos = tiposForRequest(job.request.tipo);
    const requestIds: string[] = [];

    for (const tipo of tipos) {
      const { requestId } = await ws.solicitar({
        rfc: job.request.rfc,
        fechaInicio: job.request.fechaInicio,
        fechaFin: job.request.fechaFin,
        tipo,
      });
      requestIds.push(requestId);
    }

    return persist(store, job, 'verifying', {
      sat_request_id: requestIds[0],
      sat_request_ids: requestIds,
      pending_request_ids: [...requestIds],
      attempts: 0,
      error_code: undefined,
      error_message: undefined,
    });
  } catch (e) {
    const mapped = mapCaught(e);
    return fail(store, job, mapped.code, mapped.message);
  }
}

/**
 * Un paso de avance: verify pendiente o download de un paquete.
 * Diseñado para ser llamado desde el poll del frontend (A2).
 */
export async function advanceSatDownloadJob(params: {
  jobId: string;
  store: JobStore;
  ws: SatWsClient;
  maxVerifyAttempts?: number;
}): Promise<SatDownloadJob> {
  const { jobId, store, ws } = params;
  const maxVerify = params.maxVerifyAttempts ?? 120;
  let job = await store.get(jobId);
  if (!job) throw new Error(`Job no encontrado: ${jobId}`);

  if (job.status === 'ready' || job.status === 'failed' || job.status === 'expired') {
    return job;
  }

  try {
    if (
      job.status === 'queued' ||
      job.status === 'soliciting' ||
      (job.status === 'verifying' &&
        !(job.pending_request_ids?.length || job.sat_request_ids?.length))
    ) {
      return solicitarSatDownloadJob({ jobId, store, ws });
    }

    if (job.status === 'verifying') {
      return advanceVerify({ job, store, ws, maxVerify });
    }

    if (job.status === 'downloading' || job.status === 'unpacking') {
      return advanceDownload({ job, store, ws });
    }

    return job;
  } catch (e) {
    const mapped = mapCaught(e);
    return fail(store, job, mapped.code, mapped.message);
  }
}

async function advanceVerify(params: {
  job: SatDownloadJob;
  store: JobStore;
  ws: SatWsClient;
  maxVerify: number;
}): Promise<SatDownloadJob> {
  let { job, store, ws, maxVerify } = params;
  const pending = [...(job.pending_request_ids || job.sat_request_ids || [])];
  if (pending.length === 0) {
    return fail(store, job, 'SAT_EMPTY', 'Sin IdSolicitud para verificar');
  }

  if ((job.attempts || 0) >= maxVerify) {
    return fail(
      store,
      job,
      'SAT_TIMEOUT',
      'El SAT no terminó a tiempo; reintente más tarde'
    );
  }

  // Respetar intervalo mínimo SAT (≥2s) entre verifies (omitir en mock CI)
  if (job.provider !== 'mock_ws') {
    await sleep(MIN_VERIFY_GAP_MS);
  }

  const requestId = pending[0];
  const ver = (await ws.verificar(requestId)) as VerifyResultExtra;

  job = {
    ...job,
    attempts: (job.attempts || 0) + 1,
    updated_at: new Date().toISOString(),
  };
  await store.set(job);

  if (ver.state === 'Error' || ver.state === 'Rechazada') {
    const mapped = mapSatFailure({
      kind: 'rejected',
      statusRequest: ver.state,
      message: ver.message || `SAT estado: ${ver.state}`,
      codeRequest: ver.codeRequest,
    });
    return fail(store, job, mapped.code, mapped.message);
  }

  if (ver.state === 'Terminada') {
    const rest = pending.slice(1);
    const packages = [
      ...(job.sat_package_ids || []),
      ...(ver.packageIds || []),
    ];
    let warning = job.warning;
    if (
      ver.partial ||
      isPartialPackageSignal({
        codeRequest: ver.codeRequest,
        message: ver.message,
        numberCfdis: ver.numberCfdis,
        packageCount: ver.packageIds?.length,
      })
    ) {
      warning = PARTIAL_PACKAGE_WARNING;
    }

    if (rest.length > 0) {
      return persist(store, job, 'verifying', {
        pending_request_ids: rest,
        sat_package_ids: packages,
        warning,
      });
    }

    if (packages.length === 0) {
      const mapped = mapSatFailure({
        kind: 'empty',
        message: ver.message || 'SAT no devolvió paquetes',
        codeRequest: ver.codeRequest,
      });
      return fail(store, job, mapped.code, mapped.message);
    }

    return persist(store, job, 'downloading', {
      pending_request_ids: [],
      sat_package_ids: packages,
      pending_package_ids: [...packages],
      packages: job.packages || [],
      warning,
    });
  }

  // EnProceso / Aceptada: seguir pending
  return persist(store, job, 'verifying', {
    pending_request_ids: pending,
  });
}

async function advanceDownload(params: {
  job: SatDownloadJob;
  store: JobStore;
  ws: SatWsClient;
}): Promise<SatDownloadJob> {
  let { job, store, ws } = params;
  const pending = [...(job.pending_package_ids || [])];
  if (pending.length === 0) {
    const all = job.packages || [];
    if (all.length === 0) {
      return fail(store, job, 'SAT_EMPTY', 'Paquetes sin XML');
    }
    return persist(store, job, 'ready', {
      package_count: all.length,
      error_code: undefined,
      error_message: undefined,
    });
  }

  const packageId = pending[0];
  job = await persist(store, job, 'downloading');
  const buf = await ws.descargar(packageId);
  job = await persist(store, job, 'unpacking');
  const part = await unpackSatPackageBuffer(buf);
  const merged: SatCfdiPackage[] = [...(job.packages || []), ...part];
  const rest = pending.slice(1);

  if (rest.length > 0) {
    return persist(store, job, 'downloading', {
      packages: merged,
      pending_package_ids: rest,
      package_count: merged.length,
    });
  }

  if (merged.length === 0) {
    return fail(store, job, 'SAT_EMPTY', 'Paquetes sin XML');
  }

  return persist(store, job, 'ready', {
    packages: merged,
    pending_package_ids: [],
    package_count: merged.length,
    error_code: undefined,
    error_message: undefined,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Compat E6.2 tests: corre solicitar + advances hasta ready/failed (solo MockWs rápido).
 * No usar con SOAP real (timeouts).
 */
export async function runSatDownloadJob(params: {
  jobId: string;
  store: JobStore;
  ws: SatWsClient;
  maxVerifyAttempts?: number;
}): Promise<SatDownloadJob> {
  let job = await solicitarSatDownloadJob(params);
  for (let i = 0; i < 80; i++) {
    if (job.status === 'ready' || job.status === 'failed') return job;
    job = await advanceSatDownloadJob({
      ...params,
      maxVerifyAttempts: params.maxVerifyAttempts ?? 30,
    });
  }
  return job;
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
