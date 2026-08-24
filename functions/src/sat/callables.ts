/**
 * Callables HTTPS — orquestación SAT E6.2 / E6.2.1.
 * start = solicitar; advance = un paso (poll frontend A2).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';
import type {
  AdvanceSatDownloadResponse,
  GetSatDownloadJobResponse,
  SatDownloadJob,
  SatDownloadRequest,
  StartSatDownloadResponse,
} from '../contracts';
import {
  advanceSatDownloadJob,
  createQueuedJob,
  isRateLimited,
  solicitarSatDownloadJob,
  type JobStore,
} from './jobService';
import {
  encryptPrivateKey,
  credentialFingerprint,
  zeroizeBuffer,
} from './fielVault';
import { resolveSatWsClient } from './satWsFactory';
import { SatWsClientError } from './realSatWsClient';
import { mapSatFailure } from './satErrorMap';

const MAX_JOBS_PER_HOUR = 10;
const JOBS = 'sat_download_jobs';
const CREDS = 'sat_credentials';

function firestoreStore(): JobStore {
  const db = getFirestore();
  return {
    async get(jobId) {
      const snap = await db.collection(JOBS).doc(jobId).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as Omit<SatDownloadJob, 'id'>) };
    },
    async set(job) {
      const { id, ...rest } = job;
      await db.collection(JOBS).doc(id).set(rest, { merge: true });
    },
  };
}

function assertAuth(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  return uid;
}

function memberDocId(userId: string, organizationId: string): string {
  return `${userId}_${organizationId}`;
}

async function assertOrgMember(
  uid: string,
  organizationId: string
): Promise<string> {
  const orgId = String(organizationId || '').trim();
  if (!orgId) {
    throw new HttpsError('invalid-argument', 'organizationId requerido.');
  }
  const snap = await getFirestore()
    .collection('organization_members')
    .doc(memberDocId(uid, orgId))
    .get();
  if (!snap.exists || snap.data()?.activo === false) {
    throw new HttpsError(
      'permission-denied',
      'No eres miembro activo de esa organización.'
    );
  }
  return orgId;
}

function validateRequest(req: SatDownloadRequest): void {
  if (!req?.rfc?.trim()) {
    throw new HttpsError('invalid-argument', 'RFC requerido.');
  }
  if (!req.fechaInicio || !req.fechaFin) {
    throw new HttpsError('invalid-argument', 'Rango de fechas requerido.');
  }
  if (req.fechaFin < req.fechaInicio) {
    throw new HttpsError('invalid-argument', 'fechaFin < fechaInicio.');
  }
}

async function maybePersistPackages(
  job: SatDownloadJob,
  uid: string
): Promise<SatDownloadJob> {
  if (job.status !== 'ready' || !job.packages?.length) return job;
  const store = firestoreStore();
  try {
    const bucket = getStorage().bucket();
    const path = `sat_jobs/${job.id}/packages.json`;
    await bucket.file(path).save(JSON.stringify(job.packages), {
      contentType: 'application/json',
      metadata: { jobId: job.id, usuario_id: uid },
    });
    job = { ...job, packages_path: path };
    await store.set(job);
  } catch {
    await store.set(job);
  }
  return job;
}

async function signedUrlFor(job: SatDownloadJob): Promise<string | undefined> {
  if (!job.packages_path || job.status !== 'ready') return undefined;
  try {
    const bucket = getStorage().bucket();
    const [url] = await bucket.file(job.packages_path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60_000,
    });
    return url;
  } catch {
    return undefined;
  }
}

/** Sube CER + KEY cifrada. Nunca loguea el contenido de la llave. */
export const uploadSatCredential = onCall(
  { memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const uid = assertAuth(request.auth?.uid);
    const orgId = await assertOrgMember(
      uid,
      String(request.data?.organizationId || '')
    );
    const cerBase64 = String(request.data?.cerBase64 || '');
    const keyBase64 = String(request.data?.keyBase64 || '');
    const password = request.data?.password
      ? String(request.data.password)
      : undefined;

    if (!cerBase64 || !keyBase64) {
      throw new HttpsError('invalid-argument', 'cerBase64 y keyBase64 requeridos.');
    }

    const cerBuf = Buffer.from(cerBase64, 'base64');
    const keyBuf = Buffer.from(keyBase64, 'base64');
    const encrypted = encryptPrivateKey(keyBuf);
    zeroizeBuffer(keyBuf);

    const fp = credentialFingerprint(cerBuf);
    const db = getFirestore();
    let passwordEncrypted;
    if (password) {
      const passBuf = Buffer.from(password, 'utf8');
      passwordEncrypted = encryptPrivateKey(passBuf);
      zeroizeBuffer(passBuf);
    }

    await db.collection(CREDS).doc(orgId).set(
      {
        organization_id: orgId,
        uploaded_by: uid,
        uploaded_at: new Date().toISOString(),
        cer_b64: cerBase64,
        key_encrypted: encrypted,
        has_password: Boolean(password),
        ...(passwordEncrypted
          ? { password_encrypted: passwordEncrypted }
          : {}),
        fingerprint: fp,
        keyVersion: encrypted.keyVersion,
      },
      { merge: true }
    );

    return { ok: true as const, fingerprint: fp };
  }
);

/**
 * Crea job + fase solicitar. No espera Terminada (E6.2.1 A2).
 */
export const startSatDownload = onCall(
  { memory: '512MiB', timeoutSeconds: 120 },
  async (request): Promise<StartSatDownloadResponse> => {
    const uid = assertAuth(request.auth?.uid);
    const body = request.data as SatDownloadRequest & { organizationId?: string };
    validateRequest(body);
    const orgId = await assertOrgMember(
      uid,
      String(body.organizationId || (request.data as { organizationId?: string })?.organizationId || '')
    );

    const db = getFirestore();
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const recent = await db
      .collection(JOBS)
      .where('organization_id', '==', orgId)
      .where('created_at', '>=', hourAgo)
      .limit(MAX_JOBS_PER_HOUR + 1)
      .get();

    const stamps = recent.docs.map((d) => String(d.data().created_at || ''));
    if (isRateLimited(stamps, MAX_JOBS_PER_HOUR)) {
      throw new HttpsError(
        'resource-exhausted',
        `Límite de ${MAX_JOBS_PER_HOUR} descargas/hora por organización.`
      );
    }

    let wsBundle;
    try {
      wsBundle = await resolveSatWsClient({ organizationId: orgId });
    } catch (e) {
      if (e instanceof SatWsClientError) {
        const m = e.mapped;
        throw new HttpsError(
          m.code === 'NO_CREDENTIAL' || m.code === 'SAT_AUTH'
            ? 'failed-precondition'
            : 'internal',
          m.message
        );
      }
      throw e;
    }

    const jobId = randomUUID();
    const store = firestoreStore();
    const job = await createQueuedJob({
      jobId,
      organizationId: orgId,
      userId: uid,
      request: {
        rfc: body.rfc.trim().toUpperCase(),
        fechaInicio: body.fechaInicio,
        fechaFin: body.fechaFin,
        tipo: body.tipo || 'ambos',
      },
      provider: wsBundle.providerId,
    });
    await store.set(job);

    await solicitarSatDownloadJob({
      jobId,
      store,
      ws: wsBundle.client,
    });

    return { jobId };
  }
);

/**
 * Avanza un paso del job (verify o download). Llamado desde poll frontend.
 */
export const advanceSatDownload = onCall(
  { memory: '512MiB', timeoutSeconds: 120 },
  async (request): Promise<AdvanceSatDownloadResponse> => {
    const uid = assertAuth(request.auth?.uid);
    const jobId = String(request.data?.jobId || '');
    if (!jobId) {
      throw new HttpsError('invalid-argument', 'jobId requerido.');
    }

    const store = firestoreStore();
    let job = await store.get(jobId);
    if (!job) {
      throw new HttpsError('not-found', 'Job no encontrado.');
    }
    if (job.usuario_id !== uid) {
      throw new HttpsError('permission-denied', 'No autorizado para este job.');
    }
    const orgId = await assertOrgMember(uid, String(job.organization_id || ''));

    if (job.status === 'ready' || job.status === 'failed' || job.status === 'expired') {
      return { job, packagesSignedUrl: await signedUrlFor(job) };
    }

    let wsBundle;
    try {
      wsBundle = await resolveSatWsClient({
        organizationId: orgId,
        mode: job.provider === 'sat_ws' ? 'real' : 'mock',
      });
    } catch (e) {
      const mapped =
        e instanceof SatWsClientError
          ? e.mapped
          : mapSatFailure({
              kind: 'internal',
              message: e instanceof Error ? e.message : 'Error WS',
            });
      job = {
        ...job,
        status: 'failed',
        error_code: mapped.code,
        error_message: mapped.message,
        updated_at: new Date().toISOString(),
      };
      await store.set(job);
      return { job };
    }

    job = await advanceSatDownloadJob({
      jobId,
      store,
      ws: wsBundle.client,
    });
    job = await maybePersistPackages(job, uid);

    return { job, packagesSignedUrl: await signedUrlFor(job) };
  }
);

export const getSatDownloadJob = onCall(
  { memory: '256MiB', timeoutSeconds: 60 },
  async (request): Promise<GetSatDownloadJobResponse> => {
    const uid = assertAuth(request.auth?.uid);
    const jobId = String(request.data?.jobId || '');
    if (!jobId) {
      throw new HttpsError('invalid-argument', 'jobId requerido.');
    }

    const store = firestoreStore();
    const job = await store.get(jobId);
    if (!job) {
      throw new HttpsError('not-found', 'Job no encontrado.');
    }
    if (job.usuario_id !== uid) {
      throw new HttpsError('permission-denied', 'No autorizado para este job.');
    }

    return { job, packagesSignedUrl: await signedUrlFor(job) };
  }
);
