/**
 * Genera CFDI 4.0 mínimos estructuralmente válidos para el esquema lite
 * y parseables por parseCfdiXml (E6.1 mock).
 */

export function buildMinimalCfdi40Xml(params: {
  uuid: string;
  fecha: string; // ISO-like 2026-01-15T12:00:00
  total: number;
  subtotal: number;
  iva: number;
  tipoComprobante?: 'I' | 'E';
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  concepto: string;
}): string {
  const tipo = params.tipoComprobante ?? 'I';
  const {
    uuid,
    fecha,
    total,
    subtotal,
    iva,
    emisorRfc,
    emisorNombre,
    receptorRfc,
    receptorNombre,
    concepto,
  } = params;

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0"
  Fecha="${fecha}"
  SubTotal="${subtotal.toFixed(2)}"
  Moneda="MXN"
  Total="${total.toFixed(2)}"
  TipoDeComprobante="${tipo}"
  Exportacion="01"
  MetodoPago="PUE"
  FormaPago="03"
  LugarExpedicion="06600">
  <cfdi:Emisor Rfc="${emisorRfc}" Nombre="${emisorNombre}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptorRfc}" Nombre="${receptorNombre}" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="616" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="${concepto}" ValorUnitario="${subtotal.toFixed(2)}" Importe="${subtotal.toFixed(2)}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva.toFixed(2)}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}" SelloCFD="MOCK" NoCertificadoSAT="00001000000000000000" SelloSAT="MOCK"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

/** XML intencionalmente inválido para probar fallos parciales del batch. */
export function buildMalformedCfdiXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><not-a-cfdi>broken</not-a-cfdi>`;
}

/** Factura global (InformacionGlobal) — E9.2 F1 fixture. */
export function buildGlobalInvoiceCfdi40Xml(params: {
  uuid: string;
  fecha: string;
  total: number;
  subtotal: number;
  iva: number;
  periodicidad: string;
  meses: string;
  anio: string;
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  concepto: string;
}): string {
  const {
    uuid,
    fecha,
    total,
    subtotal,
    iva,
    periodicidad,
    meses,
    anio,
    emisorRfc,
    emisorNombre,
    receptorRfc,
    receptorNombre,
    concepto,
  } = params;

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0"
  Fecha="${fecha}"
  SubTotal="${subtotal.toFixed(2)}"
  Moneda="MXN"
  Total="${total.toFixed(2)}"
  TipoDeComprobante="I"
  Exportacion="01"
  MetodoPago="PUE"
  FormaPago="03"
  LugarExpedicion="06600">
  <cfdi:InformacionGlobal Periodicidad="${periodicidad}" Meses="${meses}" Anio="${anio}"/>
  <cfdi:Emisor Rfc="${emisorRfc}" Nombre="${emisorNombre}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptorRfc}" Nombre="${receptorNombre}" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="616" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="${concepto}" ValorUnitario="${subtotal.toFixed(2)}" Importe="${subtotal.toFixed(2)}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva.toFixed(2)}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}" SelloCFD="MOCK" NoCertificadoSAT="00001000000000000000" SelloSAT="MOCK"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

/** Complemento de pago tipo P (total 0) con Pagos 2.0 — E9.2 F1 fixture. */
export function buildTipoPComplementCfdi40Xml(params: {
  uuid: string;
  fecha: string;
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  fechaPago: string;
  montoPago: number;
  documentos: Array<{
    idDocumento: string;
    impSaldoAnt: number;
    impPagado: number;
    impSaldoInsoluto: number;
  }>;
}): string {
  const doctosXml = params.documentos
    .map(
      (d) =>
        `<pago20:DoctoRelacionado IdDocumento="${d.idDocumento}" MonedaDR="MXN" ImpSaldoAnt="${d.impSaldoAnt.toFixed(2)}" ImpPagado="${d.impPagado.toFixed(2)}" ImpSaldoInsoluto="${d.impSaldoInsoluto.toFixed(2)}"/>`
    )
    .join('\n      ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  xmlns:pago20="http://www.sat.gob.mx/Pagos20"
  Version="4.0"
  Fecha="${params.fecha}"
  SubTotal="0"
  Moneda="XXX"
  Total="0"
  TipoDeComprobante="P"
  Exportacion="01"
  LugarExpedicion="06600">
  <cfdi:Emisor Rfc="${params.emisorRfc}" Nombre="${params.emisorNombre}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${params.receptorRfc}" Nombre="${params.receptorNombre}" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="616" UsoCFDI="CP01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="${params.montoPago.toFixed(2)}"/>
      <pago20:Pago FechaPago="${params.fechaPago}" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="${params.montoPago.toFixed(2)}">
      ${doctosXml}
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${params.uuid}" FechaTimbrado="${params.fecha}" SelloCFD="MOCK" NoCertificadoSAT="00001000000000000000" SelloSAT="MOCK"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}
