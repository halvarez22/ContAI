/**
 * Serializa una balanza ya validada. Sin reglas contables.
 */

import {
  ANEXO24_BALANZA_NAMESPACE,
  ANEXO24_BALANZA_SCHEMA,
  ANEXO24_POLIZAS_VERSION,
} from '../config/anexo24';
import type { Anexo24BalanzaSuccess } from '../types/anexo24Balanza';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function anexo24Money(value: number): string {
  return value.toFixed(2);
}

function monthCode(monthIndex: number): string {
  return String(monthIndex + 1).padStart(2, '0');
}

export function balanzaToXml(result: Anexo24BalanzaSuccess): { text: string; fileName: string } {
  const mes = monthCode(result.monthIndex);
  const cuentas = result.cuentas
    .map(
      (cuenta) =>
        `<Balanza:Ctas NumCta="${xmlEscape(cuenta.numCta)}" SaldoIni="${anexo24Money(cuenta.saldoIni)}" Debe="${anexo24Money(cuenta.debe)}" Haber="${anexo24Money(cuenta.haber)}" SaldoFin="${anexo24Money(cuenta.saldoFin)}"/>`
    )
    .join('');
  const text =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Balanza:Balanza xmlns:Balanza="${ANEXO24_BALANZA_NAMESPACE}" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${ANEXO24_BALANZA_NAMESPACE} ${ANEXO24_BALANZA_SCHEMA}" ` +
    `Version="${ANEXO24_POLIZAS_VERSION}" RFC="${xmlEscape(result.rfc)}" Mes="${mes}" Anio="${result.year}" ` +
    `TipoEnvio="${result.tipoEnvio}">${cuentas}</Balanza:Balanza>`;
  return {
    text,
    fileName: `BALANZA_${result.rfc}_${result.year}${mes}.xml`,
  };
}
