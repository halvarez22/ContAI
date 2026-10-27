/**
 * Defaults de importación de nómina (E13.1).
 * Cuenta fija — sin clasificador Groq.
 * Códigos: semilla Anexo 24 (E15).
 */

import { seedAccountByContaiName } from './chartOfAccounts';

const nominaGasto = seedAccountByContaiName('Gastos de Nómina');
const nominaIsr = seedAccountByContaiName('ISR por Pagar');
const nominaImss = seedAccountByContaiName('IMSS por Pagar');

export const DEFAULT_NOMINA_ACCOUNT_NAME = nominaGasto.name;
export const DEFAULT_NOMINA_ACCOUNT_CODE = nominaGasto.code;

/** Cuentas de pasivo — defaults E13.2 (exportación póliza). */
export const DEFAULT_NOMINA_ISR_ACCOUNT = nominaIsr.name;
export const DEFAULT_NOMINA_ISR_CODE = nominaIsr.code;
export const DEFAULT_NOMINA_IMSS_ACCOUNT = nominaImss.name;
export const DEFAULT_NOMINA_IMSS_CODE = nominaImss.code;

export const NOMINA_ACCOUNT_SOURCE = 'nomina_default';

/** Tolerancia en MXN para Total vs fórmula SAT (redondeo). */
export const NOMINA_TOTAL_ARITH_TOLERANCE = 0.02;

export const NOMINA_MISSING_COMPLEMENT_ERROR =
  'CFDI de nómina (Tipo N) detectado, pero falta el complemento de Nómina 1.2';
