/**
 * Factory SatWsClient según SAT_WS_MODE (E6.2.1).
 * Default: mock (cero regresión E6.2 / CI).
 */

import { createMockSatWsClient, type SatWsClient } from './satWsClient';
import {
  createRealSatWsClient,
  type SatWsClientExtended,
} from './realSatWsClient';
import { loadOrgFielMaterial } from './credentialLoader';
import { SatWsClientError } from './realSatWsClient';

export type SatWsMode = 'mock' | 'real';

export function resolveSatWsMode(
  env: NodeJS.ProcessEnv = process.env
): SatWsMode {
  const raw = (env.SAT_WS_MODE || 'mock').trim().toLowerCase();
  return raw === 'real' ? 'real' : 'mock';
}

export async function resolveSatWsClient(params: {
  organizationId: string;
  mode?: SatWsMode;
}): Promise<{ client: SatWsClient; providerId: 'mock_ws' | 'sat_ws' }> {
  const mode = params.mode ?? resolveSatWsMode();
  if (mode === 'mock') {
    return {
      client: createMockSatWsClient({ verifyCallsBeforeDone: 2 }),
      providerId: 'mock_ws',
    };
  }

  const material = await loadOrgFielMaterial(params.organizationId);
  if (!material) {
    throw new SatWsClientError(
      'no_credential',
      'No hay FIEL registrada para la organización'
    );
  }

  try {
    const client: SatWsClientExtended = await createRealSatWsClient({
      certificateContents: material.certificateContents,
      privateKeyContents: material.privateKeyContents,
      passPhrase: material.passPhrase,
    });
    return { client, providerId: 'sat_ws' };
  } finally {
    material.dispose();
  }
}
