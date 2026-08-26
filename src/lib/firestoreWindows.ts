/**
 * Ventanas temporales para listeners Firestore (H1 Endurecimiento).
 * YTD: desde 1 ene del periodYear — preserva ISR/IVA acumulado.
 */

/** Límite de seguridad: evita cargar >5k TX anuales en memoria. */
export const TRANSACTIONS_YTD_LIMIT = 5000;

export const AUDIT_LOGS_LIMIT = 100;
export const INVENTORY_MOVEMENTS_LIMIT = 500;
export const RECURRING_LIMIT = 200;

export const TRANSACTIONS_TRUNCATED_HINT =
  'Periodo con más de 5,000 transacciones. Algunas funciones de análisis podrían verse limitadas.';

/**
 * Inicio inclusive del año fiscal en ISO (compatible con `fecha` string ISO en TX).
 */
export function ytdStartIso(periodYear: number): string {
  return `${periodYear}-01-01T00:00:00.000Z`;
}
