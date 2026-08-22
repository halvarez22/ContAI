/**
 * Catálogo tipado de tasas IVA / opciones oficiales.
 * Fuente única: reexporta `lib/fiscal` para no duplicar números.
 */

export {
  IVA_TASA_OPTIONS,
  type IvaTasaCode,
  ivaRateFromCode,
  splitTotalWithIva,
  buildFiscalSnapshot,
  parseIvaTasa,
  type FiscalSnapshot,
} from '../lib/fiscal';

/** Versión de CFDI de referencia para importación (Fase 1). */
export const CFDI_VERSION_DEFAULT = '4.0' as const;
