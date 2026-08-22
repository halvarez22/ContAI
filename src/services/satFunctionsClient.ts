/**
 * Cliente tipado de callables SAT (E6.2 / E6.2.1).
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type {
  AdvanceSatDownloadResponse,
  GetSatDownloadJobResponse,
  SatDownloadRequest,
  StartSatDownloadResponse,
} from '../types/satDownload';

export async function startSatDownloadJob(
  req: SatDownloadRequest
): Promise<StartSatDownloadResponse> {
  const fn = httpsCallable<SatDownloadRequest, StartSatDownloadResponse>(
    functions,
    'startSatDownload'
  );
  const res = await fn(req);
  return res.data;
}

export async function advanceSatDownloadJob(
  jobId: string
): Promise<AdvanceSatDownloadResponse> {
  const fn = httpsCallable<{ jobId: string }, AdvanceSatDownloadResponse>(
    functions,
    'advanceSatDownload'
  );
  const res = await fn({ jobId });
  return res.data;
}

export async function getSatDownloadJob(
  jobId: string
): Promise<GetSatDownloadJobResponse> {
  const fn = httpsCallable<{ jobId: string }, GetSatDownloadJobResponse>(
    functions,
    'getSatDownloadJob'
  );
  const res = await fn({ jobId });
  return res.data;
}
