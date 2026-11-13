/**
 * Ficha de lectura del CFDI para la lista y el detalle.
 * No sustituye iva_tasa ni el previo de IVA.
 */

export type CfdiImpuestoNaturaleza = 'traslado' | 'retencion';

export type CfdiTipoFactor = 'Tasa' | 'Cuota' | 'Exento';

export type CfdiImpuestoNombre = 'IVA' | 'ISR' | 'IEPS';

export type CfdiImpuestoLinea = {
  nombre: CfdiImpuestoNombre;
  naturaleza: CfdiImpuestoNaturaleza;
  tipoFactor: CfdiTipoFactor;
  tasa: number | null;
  importe: number;
};

export type CfdiComprobanteClase =
  | 'ingreso'
  | 'egreso'
  | 'nota_credito'
  | 'nomina'
  | 'pago'
  | 'traslado';

export type CfdiFiscalFace = {
  clase: CfdiComprobanteClase;
  serie: string;
  folio: string;
  folioFiscal: string;
  descuento: number;
  impuestos: CfdiImpuestoLinea[];
};
