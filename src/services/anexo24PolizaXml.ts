/**
 * Serializa pólizas ya validadas. Sin reglas contables.
 */

import {
  ANEXO24_POLIZAS_NAMESPACE,
  ANEXO24_POLIZAS_SCHEMA,
  ANEXO24_POLIZAS_VERSION,
} from '../config/anexo24';
import type { Anexo24PolizaSuccess } from '../types/anexo24Polizas';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: number): string {
  return value.toFixed(2);
}

function monthCode(monthIndex: number): string {
  return String(monthIndex + 1).padStart(2, '0');
}

export function polizasToXml(result: Anexo24PolizaSuccess): { text: string; fileName: string } {
  const mes = monthCode(result.monthIndex);
  const polizas = result.polizas
    .map((poliza) => {
      const transacciones = poliza.transacciones
        .map((item) => {
          const comprobantes = item.comprobantes
            .map(
              (comp) =>
                `<PLZ:CompNal UUID_CFDI="${xmlEscape(comp.uuid)}" RFC="${xmlEscape(comp.rfc)}" MontoTotal="${money(comp.montoTotal)}" Moneda="${comp.moneda}" TipCamb="${comp.tipCamb}"/>`
            )
            .join('');
          return `<PLZ:Transaccion NumCta="${xmlEscape(item.numCta)}" DesCta="${xmlEscape(item.desCta)}" Concepto="${xmlEscape(item.concepto)}" Debe="${money(item.debe)}" Haber="${money(item.haber)}">${comprobantes}</PLZ:Transaccion>`;
        })
        .join('');
      return `<PLZ:Poliza TipoPoliza="${poliza.tipo}" NumUnIdenPol="${xmlEscape(poliza.numUnIdenPol)}" Fecha="${xmlEscape(poliza.fecha)}" Concepto="${xmlEscape(poliza.concepto)}">${transacciones}</PLZ:Poliza>`;
    })
    .join('');

  const text =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<PLZ:Polizas xmlns:PLZ="${ANEXO24_POLIZAS_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${ANEXO24_POLIZAS_NAMESPACE} ${ANEXO24_POLIZAS_SCHEMA}" ` +
    `Version="${ANEXO24_POLIZAS_VERSION}" RFC="${xmlEscape(result.rfc)}" Mes="${mes}" Anio="${result.year}" ` +
    `TipoSolicitud="${result.tipoSolicitud}">${polizas}</PLZ:Polizas>`;

  return {
    text,
    fileName: `POLIZAS_${result.rfc}_${result.year}${mes}.xml`,
  };
}
