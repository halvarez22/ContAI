import { describe, expect, it } from 'vitest';
import {
  createQueuedJob,
  isRateLimited,
  runSatDownloadJob,
  type JobStore,
} from './jobService';
import { createMockSatWsClient } from './satWsClient';
import type { SatDownloadJob } from '../contracts';

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

describe('runSatDownloadJob + MockSatWsClient', () => {
  it('avanza queued → ready con packages', async () => {
    const store = memoryStore();
    const job = await createQueuedJob({
      jobId: 'job-1',
      organizationId: 'org_main',
      userId: 'user-1',
      request: {
        rfc: 'ABC010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'ambos',
      },
      provider: 'mock_ws',
    });
    await store.set(job);

    const finished = await runSatDownloadJob({
      jobId: 'job-1',
      store,
      ws: createMockSatWsClient({ verifyCallsBeforeDone: 2 }),
      maxVerifyAttempts: 5,
    });

    expect(finished.status).toBe('ready');
    expect(finished.package_count).toBeGreaterThanOrEqual(1);
    expect(finished.packages?.[0]?.xmlText).toContain('cfdi:Comprobante');
    expect(finished.sat_request_id).toMatch(/^MOCK-REQ-/);
  });
});
