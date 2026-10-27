/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { parseCfdiXml } from './cfdiXml';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-01-15T12:00:00" SubTotal="100.00" Total="116.00" Moneda="MXN" TipoDeComprobante="I" MetodoPago="PUE">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Emisor"/>
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="Receptor" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Descripcion="Servicio"/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

describe('parseCfdiXml clave de producto', () => {
  it('toma la ClaveProdServ del primer concepto', () => {
    const parsed = parseCfdiXml(XML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.claveProdServ).toBe('01010101');
  });

  it('queda vacía si el concepto no trae clave', () => {
    const parsed = parseCfdiXml(XML.replace(' ClaveProdServ="01010101"', ''));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.claveProdServ).toBe('');
  });
});
