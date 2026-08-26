/**
 * Defaults de importación de nómina (E13.1).
 * Cuenta fija — sin clasificador Groq.
 */

export const DEFAULT_NOMINA_ACCOUNT_NAME = 'Gastos de Nómina';

export const NOMINA_ACCOUNT_SOURCE = 'nomina_default';

/** Tolerancia en MXN para Total vs fórmula SAT (redondeo). */
export const NOMINA_TOTAL_ARITH_TOLERANCE = 0.02;

export const NOMINA_MISSING_COMPLEMENT_ERROR =
  'CFDI de nómina (Tipo N) detectado, pero falta el complemento de Nómina 1.2';
