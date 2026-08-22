/**
 * Callables HTTPS — orquestación SAT E6.2.
 * Memory ≥512MiB en flujos que desempaquetan.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';
import type {
  SatDownloadJob,
  SatDownloadRequest,
  StartSatDownloadResponse,
  GetSatDownloadJobResponse,
} from '../contracts';
import {
  createQueuedJob,
  isRateLimited,
  runSatDownloadJob,
  type JobStore,
} from './jobService';
import { createMockSatWsClient } from './satWsClient';
import {
  encryptPrivateKey,
  credentialFingerprint,
} from './fielVault';

const ORG = 'org_main';
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

/** Sube CER + KEY cifrada. Nunca loguea el contenido de la llave. */
export const uploadSatCredential = onCall(
  { memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    const uid = assertAuth(request.auth?.uid);
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
    // zeroize best-effort
    keyBuf.fill(0);

    const fp = credentialFingerprint(cerBuf);
    const db = getFirestore();
    await db.collection(CREDS).doc(ORG).set(
      {
        organization_id: ORG,
        uploaded_by: uid,
        uploaded_at: new Date().toISOString(),
        cer_b64: cerBase64,
        key_encrypted: encrypted,
        has_password: Boolean(password),
        // password cifrado solo si se envía — mismo vault
        ...(password
          ? {
              password_encrypted: encryptPrivateKey(Buffer.from(password, 'utf8')),
            }
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
 * Crea job y ejecuta pipeline (MockWs en E6.2).
 * Memoria 512MiB por unpack.
 */
export const startSatDownload = onCall(
  { memory: '512MiB', timeoutSeconds: 300 },
  async (request): Promise<StartSatDownloadResponse> => {
    const uid = assertAuth(request.auth?.uid);
    const body = request.data as SatDownloadRequest;
    validateRequest(body);

    const db = getFirestore();
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const recent = await db
      .collection(JOBS)
      .where('organization_id', '==', ORG)
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

    const jobId = randomUUID();
    const store = firestoreStore();
    const job = await createQueuedJob({
      jobId,
      organizationId: ORG,
      userId: uid,
      request: {
        rfc: body.rfc.trim().toUpperCase(),
        fechaInicio: body.fechaInicio,
        fechaFin: body.fechaFin,
        tipo: body.tipo || 'ambos',
      },
      provider: 'mock_ws',
    });
    await store.set(job);

    const ws = createMockSatWsClient({ verifyCallsBeforeDone: 2 });
    const finished = await runSatDownloadJob({
      jobId,
      store,
      ws,
      maxVerifyAttempts: 10,
    });

    // Persistir packages en Storage si hay muchos (arquitectura A); mock suele ser chico
    if (finished.status === 'ready' && finished.packages && finished.packages.length > 0) {
      try {
        const bucket = getStorage().bucket();
        const path = `sat_jobs/${jobId}/packages.json`;
        const file = bucket.file(path);
        await file.save(JSON.stringify(finished.packages), {
          contentType: 'application/json',
          metadata: { jobId, usuario_id: uid },
        });
        finished.packages_path = path;
        // Mantener packages en doc para jobs pequeños (poll simple)
        await store.set(finished);
      } catch {
        // Emulator / sin bucket: packages quedan en el documento
        await store.set(finished);
      }
    }

    return { jobId };
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

    let packagesSignedUrl: string | undefined;
    if (job.packages_path && job.status === 'ready') {
      try {
        const bucket = getStorage().bucket();
        const [url] = await bucket.file(job.packages_path).getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60_000,
        });
        packagesSignedUrl = url;
      } catch {
        /* sin storage / emulator */
      }
    }

    return { job, packagesSignedUrl };
  }
);
