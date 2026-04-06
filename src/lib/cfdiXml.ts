/**
 * Lectura mínima de CFDI 4.0 (XML) para importar a transacciones.
 * No valida firma ni timbrado; solo extrae datos del árbol.
 */

export interface CfdiExtracted {
  version: string;
  fecha: string;
  tipoComprobante: string;
  subtotal: number;
  total: number;
  moneda: string;
  metodoPago: string;
  formaPago: string;
  lugarExpedicion: string;
  emisorRfc: string;
  emisorNombre: string;
  emisorRegimen: string;
  receptorRfc: string;
  receptorNombre: string;
  receptorUsoCfdi: string;
  totalIvaTrasladado: number;
  uuid: string | null;
  descripcionPrimerConcepto: string;
}

function firstByLocalName(doc: Document, local: string): Element | null {
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === local) return el;
  }
  return null;
}

function attrNum(el: Element | null, name: string): number {
  if (!el) return 0;
  const v = el.getAttribute(name);
  if (v == null || v === '') return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function attrStr(el: Element | null, name: string): string {
  return el?.getAttribute(name)?.trim() ?? '';
}

/**
 * Suma importes de traslados IVA (Impuesto T002) en el nodo Impuestos del comprobante o de conceptos.
 */
function sumIvaTrasladados(doc: Document): number {
  let sum = 0;
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName !== 'Traslado') continue;
    const imp = el.getAttribute('Impuesto');
    if (imp !== '002') continue;
    sum += attrNum(el, 'Importe');
  }
  return sum;
}

export function parseCfdiXml(xmlText: string): { ok: true; data: CfdiExtracted } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    errors.push('XML no válido o no se pudo analizar.');
    return { ok: false, errors };
  }

  const comp = firstByLocalName(doc, 'Comprobante');
  if (!comp) {
    errors.push('No se encontró el nodo Comprobante (¿es un CFDI?).');
    return { ok: false, errors };
  }

  const emisor = firstByLocalName(doc, 'Emisor');
  const receptor = firstByLocalName(doc, 'Receptor');
  const timbre = firstByLocalName(doc, 'TimbreFiscalDigital');
  const conceptos = firstByLocalName(doc, 'Conceptos');
  let primerConcepto: Element | null = null;
  if (conceptos) {
    const children = conceptos.getElementsByTagName('*');
    for (let i = 0; i < children.length; i++) {
      if (children[i].localName === 'Concepto') {
        primerConcepto = children[i];
        break;
      }
    }
  }

  const totalIva = sumIvaTrasladados(doc);

  const data: CfdiExtracted = {
    version: attrStr(comp, 'Version') || '4.0',
    fecha: attrStr(comp, 'Fecha'),
    tipoComprobante: attrStr(comp, 'TipoDeComprobante') || 'I',
    subtotal: attrNum(comp, 'SubTotal'),
    total: attrNum(comp, 'Total'),
    moneda: attrStr(comp, 'Moneda') || 'MXN',
    metodoPago: attrStr(comp, 'MetodoPago'),
    formaPago: attrStr(comp, 'FormaPago'),
    lugarExpedicion: attrStr(comp, 'LugarExpedicion'),
    emisorRfc: attrStr(emisor, 'Rfc'),
    emisorNombre: attrStr(emisor, 'Nombre'),
    emisorRegimen: attrStr(emisor, 'RegimenFiscal'),
    receptorRfc: attrStr(receptor, 'Rfc'),
    receptorNombre: attrStr(receptor, 'Nombre'),
    receptorUsoCfdi: attrStr(receptor, 'UsoCFDI'),
    totalIvaTrasladado: totalIva,
    uuid: timbre ? attrStr(timbre, 'UUID') || null : null,
    descripcionPrimerConcepto: primerConcepto ? attrStr(primerConcepto, 'Descripcion') : '',
  };

  if (!data.fecha) errors.push('Falta Fecha en el comprobante.');
  if (data.total <= 0) errors.push('Total inválido o cero.');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}

export function mapTipoComprobanteToTxTipo(tc: string): 'ingreso' | 'egreso' {
  const t = (tc || 'I').toUpperCase();
  if (t === 'E') return 'egreso';
  return 'ingreso';
}

/** Infiere tasa para mapear a campos internos; si no cuadra, usar na y subtotales del XML. */
export function inferIvaTasaFromAmounts(subtotal: number, iva: number): 'exento' | '0' | '8' | '16' | 'na' {
  if (subtotal <= 0) return 'na';
  if (iva <= 0) return 'exento';
  const r = iva / subtotal;
  if (r > 0.14) return '16';
  if (r > 0.06) return '8';
  return '0';
}
