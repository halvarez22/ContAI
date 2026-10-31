/**
 * Serializa un catálogo ya validado. Sin reglas contables.
 */

import {
  ANEXO24_CATALOGO_NAMESPACE,
  ANEXO24_CATALOGO_SCHEMA,
  ANEXO24_POLIZAS_VERSION,
} from '../config/anexo24';
import type { Anexo24CatalogoSuccess } from '../types/anexo24Catalogo';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function monthCode(monthIndex: number): string {
  return String(monthIndex + 1).padStart(2, '0');
}

export function catalogoToXml(result: Anexo24CatalogoSuccess): { text: string; fileName: string } {
  const mes = monthCode(result.monthIndex);
  const cuentas = result.cuentas
    .map(
      (cuenta) =>
        `<catalogocuentas:Ctas CodAgrup="${xmlEscape(cuenta.codAgrup)}" NumCta="${xmlEscape(cuenta.numCta)}" Desc="${xmlEscape(cuenta.desc)}" Nivel="${cuenta.nivel}" Natur="${cuenta.natur}"/>`
    )
    .join('');
  const text =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<catalogocuentas:Catalogo xmlns:catalogocuentas="${ANEXO24_CATALOGO_NAMESPACE}" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${ANEXO24_CATALOGO_NAMESPACE} ${ANEXO24_CATALOGO_SCHEMA}" ` +
    `Version="${ANEXO24_POLIZAS_VERSION}" RFC="${xmlEscape(result.rfc)}" Mes="${mes}" Anio="${result.year}">` +
    `${cuentas}</catalogocuentas:Catalogo>`;
  return {
    text,
    fileName: `CATALOGO_${result.rfc}_${result.year}${mes}.xml`,
  };
}
