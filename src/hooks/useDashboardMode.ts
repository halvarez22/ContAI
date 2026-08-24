import { useCallback, useState } from 'react';
import {
  DASHBOARD_MODE_STORAGE_KEY,
  isDashboardMode,
  type DashboardMode,
} from '../types/dashboardMode';

function readStoredMode(): DashboardMode {
  if (typeof window === 'undefined') return 'operativo';
  try {
    const raw = localStorage.getItem(DASHBOARD_MODE_STORAGE_KEY);
    if (isDashboardMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'operativo';
}

/**
 * Estado aislado del toggle Operativo/Ejecutivo.
 * Único punto a tocar si E7.x sincroniza preferencia con Firestore.
 */
export function useDashboardMode() {
  const [mode, setModeState] = useState<DashboardMode>(readStoredMode);

  const setMode = useCallback((next: DashboardMode) => {
    setModeState(next);
    try {
      localStorage.setItem(DASHBOARD_MODE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { mode, setMode } as const;
}
