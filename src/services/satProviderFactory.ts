/**
 * Resuelve el SatDownloadProvider según VITE_SAT_PROVIDER.
 * default: mock (E6.1) — sat_ws requiere Functions desplegadas (E6.2).
 */

import type { SatDownloadProvider } from '../types/satDownload';
import { mockSatDownloadProvider } from './providers/mockSatDownloadProvider';
import { realSatDownloadProvider } from './providers/realSatDownloadProvider';

export function resolveSatDownloadProvider(): SatDownloadProvider {
  const mode = (import.meta.env.VITE_SAT_PROVIDER || 'mock').trim().toLowerCase();
  if (mode === 'sat_ws') {
    return realSatDownloadProvider;
  }
  return mockSatDownloadProvider;
}
