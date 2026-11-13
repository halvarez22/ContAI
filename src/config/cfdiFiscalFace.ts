/**
 * Lectura del comprobante para la ficha visible.
 * Las tasas 16 %, 8 %, 0 % y exento siguen en src/lib/fiscal.ts.
 * Aquí viven la tasa 2/3, los códigos de impuesto y la nota de crédito,
 * porque no entran al previo de IVA.
 */

import type { CfdiComprobanteClase } from '../types/cfdiFiscalFace';

export const SAT_IMPUESTO_ISR = '001';
export const SAT_IMPUESTO_IVA = '002';
export const SAT_IMPUESTO_IEPS = '003';

/** TasaOCuota del IVA de dos terceras partes. No es IvaTasaCode. */
export const IVA_DOS_TERCIOS_RATE = 0.106667;
export const IVA_DOS_TERCIOS_TOLERANCE = 0.00001;
export const IVA_DOS_TERCIOS_LABEL = 'IVA 2/3';

export const USO_CFDI_NOTA_CREDITO = 'G02';
export const TIPO_RELACION_NOTA_CREDITO = '01';

export const CFDI_CLASE_LABEL: Record<CfdiComprobanteClase, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  nota_credito: 'Nota de crédito',
  nomina: 'Nómina',
  pago: 'Pago',
  traslado: 'Traslado',
};

export const FACE_TIPO_LABEL = 'Tipo';
export const FACE_FOLIO_LABEL = 'Folio';
export const FACE_FOLIO_FISCAL_LABEL = 'Folio fiscal';
export const FACE_DESCUENTO_LABEL = 'Descuento';
export const FACE_ISR_RETENIDO_LABEL = 'ISR retenido';
export const FACE_IEPS_LABEL = 'IEPS';
export const FACE_IVA_NOMBRE = 'IVA';
