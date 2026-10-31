/** E24 — umbral de aprobación por confianza. Fuente única. */

export const DEFAULT_APPROVAL_CONFIDENCE_THRESHOLD = 0.9;

export const APPROVAL_THRESHOLD_MIN = 0;

export const APPROVAL_THRESHOLD_MAX = 1;

export const AUTO_APPROVAL_ACTOR = 'auto_confidence';

export function formatApprovalThresholdPercent(threshold: number): string {
  const scaled = Math.round(threshold * 1000) / 10;
  return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
}
