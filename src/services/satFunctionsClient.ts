/**
 * Cliente tipado de callables SAT (E6.2).
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type {
  SatDownloadRequest,
  StartSatDownloadResponse,
  GetSatDownloadJobResponse,
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
