/**
 * Hook E14.0 — orquesta Demo Seed (sin SDK Firestore).
 */

import { useCallback, useMemo, useState } from 'react';
import { DEMO_SEED_COPY } from '../config/demoSeed';
import {
  commitDemoSeed,
  isDemoSeedEnvEnabled,
} from '../services/demoSeedService';
import type { DemoSeedStatus } from '../types/demoSeed';
import { canManageOrg, type OrgRole } from '../types/organization';
import { downloadTextFileBrowser } from './usePolizaExport';

export type UseDemoSeedParams = {
  organizationId: string | null | undefined;
  usuarioId: string | null | undefined;
  periodKey: string;
  orgRole: OrgRole | null;
  /** Override para tests */
  isEnvEnabled?: () => boolean;
  commit?: typeof commitDemoSeed;
  downloadTextFile?: (text: string, fileName: string) => void;
  confirmFn?: (message: string) => boolean;
};

export function useDemoSeed(params: UseDemoSeedParams) {
  const {
    organizationId,
    usuarioId,
    periodKey,
    orgRole,
    isEnvEnabled = isDemoSeedEnvEnabled,
    commit = commitDemoSeed,
    downloadTextFile = downloadTextFileBrowser,
    confirmFn = (msg: string) =>
      typeof window !== 'undefined' ? window.confirm(msg) : false,
  } = params;

  const [status, setStatus] = useState<DemoSeedStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const envEnabled = isEnvEnabled();
  const roleOk = orgRole != null && canManageOrg(orgRole);
  const canShowButton = envEnabled && roleOk;

  const runSeed = useCallback(async () => {
    if (!envEnabled) {
      setStatus('error');
      setMessage(DEMO_SEED_COPY.disabledEnv);
      return;
    }
    if (!roleOk) {
      setStatus('error');
      setMessage('Solo owner o admin pueden cargar el mes demo.');
      return;
    }
    if (!organizationId || !usuarioId) {
      setStatus('error');
      setMessage('Falta organización o usuario activo.');
      return;
    }
    if (!confirmFn(DEMO_SEED_COPY.confirmMessage)) {
      return;
    }

    setStatus('loading');
    setMessage(null);
    const result = await commit({
      organizationId,
      usuarioId,
      periodKey,
    });

    if (!result.ok) {
      setStatus('error');
      setMessage(result.reason);
      return;
    }

    downloadTextFile(result.bankCsvText, result.bankCsvFileName);
    setStatus('success');
    setMessage(
      `${DEMO_SEED_COPY.successPrefix}: ${result.createdCount} movimientos en ${result.periodKey} (purgados demo previos: ${result.purgedCount}). Se descargó ${result.bankCsvFileName}.`
    );
  }, [
    commit,
    confirmFn,
    downloadTextFile,
    envEnabled,
    organizationId,
    periodKey,
    roleOk,
    usuarioId,
  ]);

  return useMemo(
    () => ({
      canShowButton,
      status,
      message,
      runSeed,
      bannerTitle: DEMO_SEED_COPY.bannerTitle,
      bannerBody: DEMO_SEED_COPY.bannerBody,
      buttonLabel: DEMO_SEED_COPY.buttonLabel,
    }),
    [canShowButton, message, runSeed, status]
  );
}
