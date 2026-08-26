/**
 * Parser puro — Complemento de Nómina 1.2 (E13.1).
 * Monto de egreso = Comprobante@Total (no existe atributo de “neto pagado” en el XSD SAT).
 * Busca nodos por localName (ignora prefijo nomina12:).
 */

import {
  NOMINA_MISSING_COMPLEMENT_ERROR,
  NOMINA_TOTAL_ARITH_TOLERANCE,
} from '../config/nominaDefaults';
import type { NominaExtracted, NominaParseResult } from '../types/nominaImport';
import { parseCfdiXml } from './cfdiXml';

function firstByLocalName(doc: Document, local: string): Element | null {
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === local) return el;
  }
  return null;
}

function allByLocalName(doc: Document, local: string): Element[] {
  const out: Element[] = [];
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName === local) out.push(el);
  }
  return out;
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

/** Tipo N o presencia de nodo Nomina (primer match). */
export function isNominaXmlCandidate(xmlText: string): boolean {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return false;
  const comp = firstByLocalName(doc, 'Comprobante');
  const tipo = attrStr(comp, 'TipoDeComprobante').toUpperCase();
  if (tipo === 'N') return true;
  return firstByLocalName(doc, 'Nomina') != null;
}

function sumDeduccionesByTipo(doc: Document, tipoDeduccion: string): number {
  let sum = 0;
  for (const el of allByLocalName(doc, 'Deduccion')) {
    if (attrStr(el, 'TipoDeduccion') === tipoDeduccion) {
      sum += attrNum(el, 'Importe');
    }
  }
  return sum;
}

/**
 * Extrae nómina 1.2. Solo el primer nodo Nomina si hay varios (deuda E13.x).
 */
export function parseNominaXml(xmlContent: string): NominaParseResult {
  const base = parseCfdiXml(xmlContent);
  if (base.ok === false) {
    return { ok: false, errors: base.errors };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');
  if (doc.querySelector('parsererror')) {
    return { ok: false, errors: ['XML no válido o no se pudo analizar.'] };
  }

  const tipo = (base.data.tipoComprobante || '').toUpperCase();
  const nomina = firstByLocalName(doc, 'Nomina');

  if (tipo === 'N' && !nomina) {
    return { ok: false, errors: [NOMINA_MISSING_COMPLEMENT_ERROR] };
  }

  if (!nomina) {
    return {
      ok: false,
      errors: ['No se encontró el complemento de Nómina 1.2 en el XML.'],
    };
  }

  const totalPercepciones = attrNum(nomina, 'TotalPercepciones');
  const totalDeducciones = attrNum(nomina, 'TotalDeducciones');
  const totalOtrosPagos = attrNum(nomina, 'TotalOtrosPagos');
  const fechaPago = attrStr(nomina, 'FechaPago') || base.data.fecha;
  const tipoNomina = attrStr(nomina, 'TipoNomina');

  const isrRetenido = sumDeduccionesByTipo(doc, '002');
  const imssRetenido = sumDeduccionesByTipo(doc, '001');

  const expectedNet = totalPercepciones + totalOtrosPagos - totalDeducciones;
  const warnings: string[] = [];
  if (
    totalPercepciones > 0 ||
    totalDeducciones > 0 ||
    totalOtrosPagos > 0
  ) {
    const delta = Math.abs(base.data.total - expectedNet);
    if (delta > NOMINA_TOTAL_ARITH_TOLERANCE) {
      warnings.push(
        `Descuadre aritmético nómina: Total=${base.data.total} vs Percepciones+Otros−Deducciones=${expectedNet.toFixed(2)} (Δ=${delta.toFixed(2)}). Se usa Comprobante@Total.`
      );
    }
  }

  const empleadoRfc = base.data.receptorRfc;
  const empleadoNombre = base.data.receptorNombre;

  const data: NominaExtracted = {
    total: base.data.total,
    subtotal: base.data.subtotal,
    moneda: base.data.moneda || 'MXN',
    fecha: base.data.fecha,
    fechaPago,
    cfdiUuid: base.data.uuid,
    tipoComprobante: tipo || 'N',
    emisorRfc: base.data.emisorRfc,
    emisorNombre: base.data.emisorNombre,
    empleadoRfc,
    empleadoNombre,
    totalPercepciones,
    totalDeducciones,
    totalOtrosPagos,
    isrRetenido,
    imssRetenido,
    tipoNomina,
    warnings,
  };

  return { ok: true, data };
}

/** Vista compatible con preview CFDI existente (sin UI nueva). */
export function nominaToCfdiPreviewShape(
  n: NominaExtracted
): import('./cfdiXml').CfdiExtracted {
  return {
    version: '4.0',
    fecha: n.fecha,
    tipoComprobante: 'N',
    subtotal: n.subtotal,
    total: n.total,
    moneda: n.moneda,
    metodoPago: '',
    formaPago: '',
    lugarExpedicion: '',
    emisorRfc: n.emisorRfc,
    emisorNombre: n.emisorNombre,
    emisorRegimen: '',
    receptorRfc: n.empleadoRfc,
    receptorNombre: n.empleadoNombre,
    receptorUsoCfdi: '',
    totalIvaTrasladado: 0,
    uuid: n.cfdiUuid,
    descripcionPrimerConcepto: `Nómina · ${n.empleadoNombre || n.empleadoRfc}`,
  };
}
