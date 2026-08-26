/**
 * Fixtures sintéticos CFDI Nómina 1.2 (E13.1) — no validan firma.
 */

export function buildNominaCfdi40Xml(params: {
  uuid: string;
  fecha: string;
  fechaPago: string;
  total: number;
  subtotal: number;
  totalPercepciones: number;
  totalDeducciones: number;
  totalOtrosPagos?: number;
  isr: number;
  imss: number;
  emisorRfc: string;
  emisorNombre: string;
  empleadoRfc: string;
  empleadoNombre: string;
}): string {
  const otros = params.totalOtrosPagos ?? 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  xmlns:nomina12="http://www.sat.gob.mx/nomina12"
  Version="4.0"
  Fecha="${params.fecha}"
  SubTotal="${params.subtotal.toFixed(2)}"
  Moneda="MXN"
  Total="${params.total.toFixed(2)}"
  TipoDeComprobante="N"
  Exportacion="01"
  LugarExpedicion="06600">
  <cfdi:Emisor Rfc="${params.emisorRfc}" Nombre="${params.emisorNombre}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${params.empleadoRfc}" Nombre="${params.empleadoNombre}" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="605" UsoCFDI="CN01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111505" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago de nómina" ValorUnitario="${params.subtotal.toFixed(2)}" Importe="${params.subtotal.toFixed(2)}" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <nomina12:Nomina Version="1.2" TipoNomina="O" FechaPago="${params.fechaPago}" FechaInicialPago="${params.fechaPago}" FechaFinalPago="${params.fechaPago}" NumDiasPagados="15"
      TotalPercepciones="${params.totalPercepciones.toFixed(2)}" TotalDeducciones="${params.totalDeducciones.toFixed(2)}" TotalOtrosPagos="${otros.toFixed(2)}">
      <nomina12:Receptor Curp="XAXX010101HDFXXX09" TipoContrato="01" TipoRegimen="02" NumEmpleado="001" PeriodicidadPago="04" ClaveEntFed="DIF"/>
      <nomina12:Percepciones TotalSueldos="${params.totalPercepciones.toFixed(2)}" TotalGravado="${params.totalPercepciones.toFixed(2)}" TotalExento="0.00">
        <nomina12:Percepcion TipoPercepcion="001" Clave="P001" Concepto="Sueldo" ImporteGravado="${params.totalPercepciones.toFixed(2)}" ImporteExento="0.00"/>
      </nomina12:Percepciones>
      <nomina12:Deducciones TotalOtrasDeducciones="${params.imss.toFixed(2)}" TotalImpuestosRetenidos="${params.isr.toFixed(2)}">
        <nomina12:Deduccion TipoDeduccion="001" Clave="D001" Concepto="Seguridad social" Importe="${params.imss.toFixed(2)}"/>
        <nomina12:Deduccion TipoDeduccion="002" Clave="D002" Concepto="ISR" Importe="${params.isr.toFixed(2)}"/>
      </nomina12:Deducciones>
    </nomina12:Nomina>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${params.uuid}" FechaTimbrado="${params.fecha}" SelloCFD="MOCK" NoCertificadoSAT="00001000000000000000" SelloSAT="MOCK"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

/** Tipo N sin nodo Nomina — error explícito E13.1. */
export function buildTipoNWithoutNominaComplementXml(params: {
  uuid: string;
  fecha: string;
  total: number;
  emisorRfc: string;
  empleadoRfc: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0"
  Fecha="${params.fecha}"
  SubTotal="${params.total.toFixed(2)}"
  Moneda="MXN"
  Total="${params.total.toFixed(2)}"
  TipoDeComprobante="N"
  Exportacion="01"
  LugarExpedicion="06600">
  <cfdi:Emisor Rfc="${params.emisorRfc}" Nombre="Patron SA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${params.empleadoRfc}" Nombre="Empleado" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="605" UsoCFDI="CN01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111505" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago de nómina" ValorUnitario="${params.total.toFixed(2)}" Importe="${params.total.toFixed(2)}" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${params.uuid}" FechaTimbrado="${params.fecha}" SelloCFD="MOCK" NoCertificadoSAT="00001000000000000000" SelloSAT="MOCK"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}
