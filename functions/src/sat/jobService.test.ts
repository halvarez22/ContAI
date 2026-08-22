import { describe, expect, it } from 'vitest';
import {
  advanceSatDownloadJob,
  createQueuedJob,
  isRateLimited,
  solicitarSatDownloadJob,
  type JobStore,
} from './jobService';
import { createMockSatWsClient } from './satWsClient';
import type { SatDownloadJob } from '../contracts';
import { PARTIAL_PACKAGE_WARNING } from './satErrorMap';
import type { SatWsClient } from './satWsClient';

function memoryStore(): JobStore & { map: Map<string, SatDownloadJob> } {
  const map = new Map<string, SatDownloadJob>();
  return {
    map,
    async get(id) {
      return map.get(id) ?? null;
    },
    async set(job) {
      map.set(job.id, { ...job });
    },
  };
}

describe('isRateLimited', () => {
  it('bloquea cuando hay N jobs en la última hora', () => {
    const now = Date.now();
    const stamps = Array.from({ length: 10 }, (_, i) =>
      new Date(now - i * 1000).toISOString()
    );
    expect(isRateLimited(stamps, 10, now)).toBe(true);
    expect(isRateLimited(stamps.slice(0, 5), 10, now)).toBe(false);
  });
});

describe('solicitar + advance (async A2)', () => {
  it('avanza verifying → ready vía advances (MockWs)', async () => {
    const store = memoryStore();
    const job = await createQueuedJob({
      jobId: 'job-1',
      organizationId: 'org_main',
      userId: 'u1',
      request: {
        rfc: 'ABC010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'emitidos',
      },
      provider: 'mock_ws',
    });
    await store.set(job);
    const ws = createMockSatWsClient({ verifyCallsBeforeDone: 2 });

    let cur = await solicitarSatDownloadJob({ jobId: 'job-1', store, ws });
    expect(cur.status).toBe('verifying');
    expect(cur.sat_request_id).toBeTruthy();

    cur = await advanceSatDownloadJob({ jobId: 'job-1', store, ws });
    expect(cur.status).toBe('verifying');

    cur = await advanceSatDownloadJob({ jobId: 'job-1', store, ws });
    expect(['downloading', 'unpacking', 'ready']).toContain(cur.status);

    for (let i = 0; i < 5 && cur.status !== 'ready' && cur.status !== 'failed'; i++) {
      cur = await advanceSatDownloadJob({ jobId: 'job-1', store, ws });
    }
    expect(cur.status).toBe('ready');
    expect(cur.packages?.length).toBeGreaterThan(0);
  });

  it('tipo ambos crea dos IdSolicitud', async () => {
    const store = memoryStore();
    const job = await createQueuedJob({
      jobId: 'job-ambos',
      organizationId: 'org_main',
      userId: 'u1',
      request: {
        rfc: 'ABC010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'ambos',
      },
      provider: 'mock_ws',
    });
    await store.set(job);
    const ws = createMockSatWsClient({ verifyCallsBeforeDone: 1 });
    const cur = await solicitarSatDownloadJob({
      jobId: 'job-ambos',
      store,
      ws,
    });
    expect(cur.sat_request_ids).toHaveLength(2);
    expect(cur.pending_request_ids).toHaveLength(2);
  });

  it('marca warning en paquete parcial y deja ready', async () => {
    const store = memoryStore();
    const job = await createQueuedJob({
      jobId: 'job-partial',
      organizationId: 'org_main',
      userId: 'u1',
      request: {
        rfc: 'ABC010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'emitidos',
      },
      provider: 'mock_ws',
    });
    await store.set(job);

    const ws: SatWsClient = {
      id: 'mock_ws',
      async solicitar() {
        return { requestId: 'R1' };
      },
      async verificar() {
        return {
          state: 'Terminada',
          packageIds: ['P1'],
          numberCfdis: 100,
          codeRequest: 'MaximumLimitReaded',
          message: 'paquete parcial',
          partial: true,
        } as {
          state: 'Terminada';
          packageIds: string[];
        };
      },
      async descargar() {
        return Buffer.from(
          JSON.stringify({
            mockZip: true,
            xmls: [
              {
                fileName: 'a.xml',
                xmlText: '<cfdi:Comprobante/>',
                uuid: 'u1',
              },
            ],
          })
        );
      },
    };

    await solicitarSatDownloadJob({ jobId: 'job-partial', store, ws });
    let cur = await advanceSatDownloadJob({ jobId: 'job-partial', store, ws });
    expect(cur.warning).toBe(PARTIAL_PACKAGE_WARNING);
    for (let i = 0; i < 5 && cur.status !== 'ready'; i++) {
      cur = await advanceSatDownloadJob({ jobId: 'job-partial', store, ws });
    }
    expect(cur.status).toBe('ready');
    expect(cur.warning).toBe(PARTIAL_PACKAGE_WARNING);
  });
});
