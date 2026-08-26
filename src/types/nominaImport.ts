/**
 * Contratos tipados — extracción CFDI Nómina 1.2 (E13.1).
 * Sin any. Monto de egreso = Comprobante@Total únicamente.
 */

export interface NominaExtracted {
  /** Comprobante@Total — único monto del egreso (neto pagado). */
  total: number;
  subtotal: number;
  moneda: string;
  fecha: string;
  /** Nomina@FechaPago si existe; si no, fecha del comprobante. */
  fechaPago: string;
  cfdiUuid: string | null;
  tipoComprobante: 'N' | string;
  emisorRfc: string;
  emisorNombre: string;
  empleadoRfc: string;
  empleadoNombre: string;
  totalPercepciones: number;
  totalDeducciones: number;
  totalOtrosPagos: number;
  /** Suma Deduccion TipoDeduccion=002 */
  isrRetenido: number;
  /** Suma Deduccion TipoDeduccion=001 */
  imssRetenido: number;
  tipoNomina: string;
  /** Warnings no fatales (p.ej. descuadre aritmético ≤ tolerancia). */
  warnings: string[];
}

export type NominaParseResult =
  | { ok: true; data: NominaExtracted }
  | { ok: false; errors: string[] };
