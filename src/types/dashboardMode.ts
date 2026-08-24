/** Modo de dashboard (contexto E7.1 / E7.2). Persistencia vía useDashboardMode. */

export type DashboardMode = 'operativo' | 'ejecutivo';

export const DASHBOARD_MODE_STORAGE_KEY = 'contai.dashboardMode';

export function isDashboardMode(value: unknown): value is DashboardMode {
  return value === 'operativo' || value === 'ejecutivo';
}
