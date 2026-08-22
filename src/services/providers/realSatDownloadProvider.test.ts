import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { realSatDownloadProvider } from './realSatDownloadProvider';

vi.mock('../satFunctionsClient', () => ({
  startSatDownloadJob: vi.fn(),
  getSatDownloadJob: vi.fn(),
}));

import {
  startSatDownloadJob,
  getSatDownloadJob,
} from '../satFunctionsClient';

describe('realSatDownloadProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(startSatDownloadJob).mockReset();
    vi.mocked(getSatDownloadJob).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resuelve packages tras poll ready (backoff exponencial)', async () => {
    vi.mocked(startSatDownloadJob).mockResolvedValue({ jobId: 'j1' });
    vi.mocked(getSatDownloadJob)
      .mockResolvedValueOnce({
        job: {
          id: 'j1',
          organization_id: 'org_main',
          usuario_id: 'u1',
          request: {
            rfc: 'ABC010101AAA',
            fechaInicio: '2026-01-01',
            fechaFin: '2026-01-31',
            tipo: 'ambos',
          },
          status: 'verifying',
          attempts: 1,
          provider: 'mock_ws',
        },
      })
      .mockResolvedValueOnce({
        job: {
          id: 'j1',
          organization_id: 'org_main',
          usuario_id: 'u1',
          request: {
            rfc: 'ABC010101AAA',
            fechaInicio: '2026-01-01',
            fechaFin: '2026-01-31',
            tipo: 'ambos',
          },
          status: 'ready',
          attempts: 2,
          provider: 'mock_ws',
          packages: [
            { fileName: 'x.xml', xmlText: '<cfdi:Comprobante/>', uuid: 'u' },
          ],
          package_count: 1,
        },
      });

    const pending = realSatDownloadProvider.download({
      rfc: 'ABC010101AAA',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-31',
      tipo: 'ambos',
    });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('sat_ws');
    expect(result.packages).toHaveLength(1);
    expect(getSatDownloadJob).toHaveBeenCalledTimes(2);
  });
});
