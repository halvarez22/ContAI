/**
 * Lee la ficha del XML y arma el texto que ve el contador.
 * No cambia iva_tasa ni manda el XML a Groq.
 */

import {
  CFDI_CLASE_LABEL,
  FACE_DESCUENTO_LABEL,
  FACE_FOLIO_FISCAL_LABEL,
  FACE_FOLIO_LABEL,
  FACE_IEPS_LABEL,
  FACE_ISR_RETENIDO_LABEL,
  FACE_IVA_NOMBRE,
  FACE_TIPO_LABEL,
  IVA_DOS_TERCIOS_LABEL,
  IVA_DOS_TERCIOS_RATE,
  IVA_DOS_TERCIOS_TOLERANCE,
  SAT_IMPUESTO_IEPS,
  SAT_IMPUESTO_ISR,
  SAT_IMPUESTO_IVA,
  TIPO_RELACION_NOTA_CREDITO,
  USO_CFDI_NOTA_CREDITO,
} from '../config/cfdiFiscalFace';
import { IVA_TASA_OPTIONS } from '../lib/fiscal';
import { roundMoney } from '../types/paymentApplication';
import type {
  CfdiComprobanteClase,
  CfdiFiscalFace,
  CfdiImpuestoLinea,
  CfdiImpuestoNombre,
  CfdiImpuestoNaturaleza,
  CfdiTipoFactor,
} from '../types/cfdiFiscalFace';

function firstByLocalName(doc: Document, local: string): Element | null {
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === local) return all[i];
  }
  return null;
}

function childByLocalName(el: Element, local: string): Element | null {
  const kids = el.children;
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].localName === local) return kids[i];
  }
  return null;
}

function descendantsByLocalName(root: Element, local: string): Element[] {
  const out: Element[] = [];
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === local) out.push(all[i]);
  }
  return out;
}

function attr(el: Element | null, name: string): string {
  return el?.getAttribute(name)?.trim() ?? '';
}

function parseAmount(raw: string | null): number {
  if (!raw) return 0;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

function parseTasa(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function impuestoNombre(code: string): CfdiImpuestoNombre | null {
  if (code === SAT_IMPUESTO_IVA) return 'IVA';
  if (code === SAT_IMPUESTO_ISR) return 'ISR';
  if (code === SAT_IMPUESTO_IEPS) return 'IEPS';
  return null;
}

function tipoFactorOf(raw: string): CfdiTipoFactor {
  if (raw === 'Exento' || raw === 'Cuota' || raw === 'Tasa') return raw;
  return 'Tasa';
}

function tasaKey(tasa: number | null): string {
  if (tasa == null) return 'none';
  return String(Math.round(tasa * 1_000_000) / 1_000_000);
}

function hasRelacionNotaCredito(doc: Document): boolean {
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const name = all[i].localName;
    if (name !== 'CfdiRelacionados' && name !== 'CfdiRelacionado') continue;
    if (attr(all[i], 'TipoRelacion') === TIPO_RELACION_NOTA_CREDITO) return true;
  }
  return false;
}

function claseOf(tipo: string, uso: string, notaPorRelacion: boolean): CfdiComprobanteClase {
  const t = tipo.toUpperCase();
  if (t === 'E' && (uso.toUpperCase() === USO_CFDI_NOTA_CREDITO || notaPorRelacion)) {
    return 'nota_credito';
  }
  if (t === 'E') return 'egreso';
  if (t === 'N') return 'nomina';
  if (t === 'P') return 'pago';
  if (t === 'T') return 'traslado';
  return 'ingreso';
}

function collectFromImpuestos(
  impuestos: Element,
  groups: Map<string, CfdiImpuestoLinea>
): void {
  const add = (el: Element, naturaleza: CfdiImpuestoNaturaleza) => {
    const nombre = impuestoNombre(attr(el, 'Impuesto'));
    if (!nombre) return;
    const tipoFactor = tipoFactorOf(attr(el, 'TipoFactor'));
    const tasa = tipoFactor === 'Exento' ? null : parseTasa(el.getAttribute('TasaOCuota'));
    const importe = parseAmount(el.getAttribute('Importe'));
    const key = `${nombre}|${naturaleza}|${tipoFactor}|${tasaKey(tasa)}`;
    const prev = groups.get(key);
    if (prev) {
      prev.importe = roundMoney(prev.importe + importe);
      return;
    }
    groups.set(key, { nombre, naturaleza, tipoFactor, tasa, importe });
  };

  for (const el of descendantsByLocalName(impuestos, 'Traslado')) add(el, 'traslado');
  for (const el of descendantsByLocalName(impuestos, 'Retencion')) add(el, 'retencion');
}

function collectImpuestos(comp: Element): CfdiImpuestoLinea[] {
  const groups = new Map<string, CfdiImpuestoLinea>();
  const summary = childByLocalName(comp, 'Impuestos');
  if (summary) {
    collectFromImpuestos(summary, groups);
    return [...groups.values()];
  }

  for (const concepto of descendantsByLocalName(comp, 'Concepto')) {
    const impuestos = childByLocalName(concepto, 'Impuestos');
    if (impuestos) collectFromImpuestos(impuestos, groups);
  }
  return [...groups.values()];
}

export function readCfdiFiscalFace(xmlText: string): CfdiFiscalFace | null {
  if (!xmlText.trim()) return null;
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return null;
  const comp = firstByLocalName(doc, 'Comprobante');
  if (!comp) return null;

  const receptor = firstByLocalName(doc, 'Receptor');
  const timbre = firstByLocalName(doc, 'TimbreFiscalDigital');
  const tipo = attr(comp, 'TipoDeComprobante') || 'I';

  return {
    clase: claseOf(tipo, attr(receptor, 'UsoCFDI'), hasRelacionNotaCredito(doc)),
    serie: attr(comp, 'Serie'),
    folio: attr(comp, 'Folio'),
    folioFiscal: timbre ? attr(timbre, 'UUID') : '',
    descuento: parseAmount(comp.getAttribute('Descuento')),
    impuestos: collectImpuestos(comp),
  };
}

/**
 * Puro. Si agrega el ISR de nómina, devuelve otra ficha.
 * El argumento no se modifica.
 */
export function appendNominaIsr(face: CfdiFiscalFace, isrRetenido: number): CfdiFiscalFace {
  if (!(isrRetenido > 0)) return face;
  const already = face.impuestos.some(
    (line) => line.nombre === 'ISR' && line.naturaleza === 'retencion'
  );
  if (already) return face;
  const line: CfdiImpuestoLinea = {
    nombre: 'ISR',
    naturaleza: 'retencion',
    tipoFactor: 'Tasa',
    tasa: null,
    importe: roundMoney(isrRetenido),
  };
  return { ...face, impuestos: [...face.impuestos, line] };
}

function formatPercent(tasa: number): string {
  const pct = Math.round(tasa * 1_000_000) / 10_000;
  return `${pct}%`;
}

function money(amount: number): string {
  return roundMoney(amount).toFixed(2);
}

function ivaLabel(line: CfdiImpuestoLinea): string {
  if (line.tipoFactor === 'Exento') {
    return IVA_TASA_OPTIONS.find((row) => row.value === 'exento')?.label ?? 'Exento';
  }
  if (
    line.tasa != null &&
    Math.abs(line.tasa - IVA_DOS_TERCIOS_RATE) <= IVA_DOS_TERCIOS_TOLERANCE
  ) {
    return IVA_DOS_TERCIOS_LABEL;
  }
  const tasa = line.tasa;
  if (tasa != null) {
    const match = IVA_TASA_OPTIONS.find(
      (row) =>
        row.value !== 'na' &&
        row.value !== 'exento' &&
        Math.abs(row.rate - tasa) <= 0.000001
    );
    if (match) return match.label;
    return `${FACE_IVA_NOMBRE} ${formatPercent(tasa)}`;
  }
  return IVA_TASA_OPTIONS.find((row) => row.value === 'exento')?.label ?? 'Exento';
}

function lineText(line: CfdiImpuestoLinea): string {
  if (line.nombre === 'IVA') {
    const label = ivaLabel(line);
    return line.importe > 0 ? `${label} · ${money(line.importe)}` : label;
  }
  const prefix = line.nombre === 'ISR' ? FACE_ISR_RETENIDO_LABEL : FACE_IEPS_LABEL;
  const rate = line.tasa != null ? ` ${formatPercent(line.tasa)}` : '';
  return `${prefix}${rate} · ${money(line.importe)}`;
}

export function formatCfdiFiscalFace(face: CfdiFiscalFace): string {
  const lines = [`${FACE_TIPO_LABEL}: ${CFDI_CLASE_LABEL[face.clase]}`];
  const folio = [face.serie, face.folio].filter((part) => part.length > 0).join(' ');
  if (folio) lines.push(`${FACE_FOLIO_LABEL}: ${folio}`);
  if (face.folioFiscal) lines.push(`${FACE_FOLIO_FISCAL_LABEL}: ${face.folioFiscal}`);
  for (const tax of face.impuestos) lines.push(lineText(tax));
  if (face.descuento > 0) lines.push(`${FACE_DESCUENTO_LABEL}: ${money(face.descuento)}`);
  return lines.join('\n');
}
