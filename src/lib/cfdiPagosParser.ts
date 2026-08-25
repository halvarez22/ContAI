/**
 * Extracción SAT E9.2: InformacionGlobal y complemento Pagos 2.0 (DoctoRelacionado).
 * No valida firma; complementa parseCfdiXml sin alterar pipeline I/E.
 */

import { parseCfdiXml, type CfdiExtracted } from './cfdiXml';

export type InformacionGlobalExtracted = {
  periodicidad: string;
  meses: string;
  anio: string;
};

export type DoctoRelacionadoExtracted = {
  idDocumento: string;
  serie?: string;
  folio?: string;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
  monedaDR: string;
};

export type PagoExtracted = {
  fechaPago: string;
  formaDePagoP: string;
  monedaP: string;
  monto: number;
  documentos: DoctoRelacionadoExtracted[];
};

export type CfdiSatExtensions = {
  informacionGlobal?: InformacionGlobalExtracted;
  pagos: PagoExtracted[];
};

export type CfdiExtractedExtended = CfdiExtracted & CfdiSatExtensions;

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

export function extractInformacionGlobal(
  doc: Document
): InformacionGlobalExtracted | undefined {
  const node = firstByLocalName(doc, 'InformacionGlobal');
  if (!node) return undefined;
  const periodicidad = attrStr(node, 'Periodicidad');
  const meses = attrStr(node, 'Meses');
  const anio = attrStr(node, 'Anio') || attrStr(node, 'Año');
  if (!periodicidad && !meses && !anio) return undefined;
  return { periodicidad, meses, anio };
}

function extractDoctoRelacionado(el: Element): DoctoRelacionadoExtracted | null {
  const idDocumento = attrStr(el, 'IdDocumento');
  if (!idDocumento) return null;
  return {
    idDocumento,
    serie: attrStr(el, 'Serie') || undefined,
    folio: attrStr(el, 'Folio') || undefined,
    impSaldoAnt: attrNum(el, 'ImpSaldoAnt'),
    impPagado: attrNum(el, 'ImpPagado'),
    impSaldoInsoluto: attrNum(el, 'ImpSaldoInsoluto'),
    monedaDR: attrStr(el, 'MonedaDR') || 'MXN',
  };
}

function extractPagoNode(pagoEl: Element): PagoExtracted | null {
  const fechaPago = attrStr(pagoEl, 'FechaPago');
  const monto = attrNum(pagoEl, 'Monto');
  if (!fechaPago || monto <= 0) return null;

  const documentos: DoctoRelacionadoExtracted[] = [];
  const descendants = pagoEl.getElementsByTagName('*');
  for (let i = 0; i < descendants.length; i++) {
    const drEl = descendants[i];
    if (drEl.localName !== 'DoctoRelacionado') continue;
    const dr = extractDoctoRelacionado(drEl);
    if (dr) documentos.push(dr);
  }

  return {
    fechaPago,
    formaDePagoP: attrStr(pagoEl, 'FormaDePagoP'),
    monedaP: attrStr(pagoEl, 'MonedaP') || 'MXN',
    monto,
    documentos,
  };
}

export function extractPagosComplement(doc: Document): PagoExtracted[] {
  const pagos: PagoExtracted[] = [];
  for (const pagoEl of allByLocalName(doc, 'Pago')) {
    const parsed = extractPagoNode(pagoEl);
    if (parsed && parsed.documentos.length > 0) pagos.push(parsed);
  }
  return pagos;
}

export function extractSatExtensionsFromDocument(doc: Document): CfdiSatExtensions {
  return {
    informacionGlobal: extractInformacionGlobal(doc),
    pagos: extractPagosComplement(doc),
  };
}

/**
 * Parse CFDI base + extensiones SAT (global / Pagos 2.0).
 */
export function parseCfdiWithSatExtensions(
  xmlText: string
): { ok: true; data: CfdiExtractedExtended } | { ok: false; errors: string[] } {
  const base = parseCfdiXml(xmlText);
  if (base.ok === false) {
    return { ok: false, errors: base.errors };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    return { ok: false, errors: ['XML no válido o no se pudo analizar.'] };
  }

  const extensions = extractSatExtensionsFromDocument(doc);
  return {
    ok: true,
    data: {
      ...base.data,
      ...extensions,
    },
  };
}
