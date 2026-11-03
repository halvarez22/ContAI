import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  CFDI_33_REJECT_REASON,
  CFDI_XSD_REJECT_REASON,
  formatCfdiXsdRejection,
  validateCfdiXmlAgainstXsd,
} from './cfdiXsdValidate';

const require = createRequire(import.meta.url);

const SAMPLE_CFDI = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Fecha="2026-06-12T12:00:00" SubTotal="100" Total="116" Moneda="MXN"
  TipoDeComprobante="I" LugarExpedicion="01000" Exportacion="01">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR DEMO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="RECEPTOR DEMO" UsoCFDI="G03"
    DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="H87"
      Descripcion="Demo" ValorUnitario="100" Importe="100" ObjetoImp="02"/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

describe('validateCfdiXmlAgainstXsd', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          '<!doctype html><html><head></head><body>SPA fallback</body></html>',
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('si /cfdi/xsd/cfdv40.xsd es HTML (Vercel SPA), no reporta error doctype/sat', async () => {
    const r = await validateCfdiXmlAgainstXsd(SAMPLE_CFDI);
    expect(r.errors.join(' ')).not.toMatch(/doctype html/i);
    expect(r.errors.join(' ')).not.toMatch(/WXS schema cfdv40/i);
    // En Node/vitest el WASM a veces no compila; en browser cae a lite.
    // Lo crítico: no quedarse en mode sat con HTML de Vercel.
    expect(r.mode).not.toBe('sat');
  });

  it('rechaza contenido no XML', async () => {
    const r = await validateCfdiXmlAgainstXsd('hola mundo');
    expect(r.valid).toBe(false);
    expect(r.mode).toBe('skipped');
    expect(r.errors).toEqual([CFDI_XSD_REJECT_REASON]);
  });

  it('un comprobante 3.3 avisa en español y no pide editar el archivo', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" Version="3.3"
  Fecha="2026-01-15T12:00:00" SubTotal="100" Total="116" Moneda="MXN"
  TipoDeComprobante="I" LugarExpedicion="01000"/>`;
    const r = await validateCfdiXmlAgainstXsd(xml);
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual([CFDI_33_REJECT_REASON]);
    expect(r.errors.join(' ')).not.toMatch(/schema|allowed|declaration/i);
    expect(formatCfdiXsdRejection(r, 'factura.xml')).toBe(
      `factura.xml: ${CFDI_33_REJECT_REASON}`
    );
  });

  it('una factura 4.0 con condiciones de pago pasa el esquema reducido', async () => {
    const { validateXML } = require('xmllint-wasm') as {
      validateXML: (options: {
        xml: { fileName: string; contents: string };
        schema: { fileName: string; contents: string };
      }) => Promise<{ valid: boolean; errors: Array<{ message: string }> }>;
    };
    const xsd = readFileSync(
      new URL('../assets/cfdi/cfdi40-comprobante-lite.xsd', import.meta.url),
      'utf8'
    );
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0"
  Fecha="2026-10-15T12:00:00" Sello="ABC" CondicionesDePago="Contado"
  SubTotal="1000.00" Total="1160.00" Moneda="MXN" TipoDeComprobante="I"
  Exportacion="01" MetodoPago="PUE" FormaPago="03" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="RECEPTOR" UsoCFDI="G03"
    DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="616"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48"
      Descripcion="Servicio" ValorUnitario="1000.00" Importe="1000.00" ObjetoImp="02"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="11111111-1111-1111-1111-111111111111"
      FechaTimbrado="2026-10-15T12:00:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
    const r = await validateXML({
      xml: { fileName: 'cfdi.xml', contents: xml },
      schema: { fileName: 'cfdi40-comprobante-lite.xsd', contents: xsd },
    });
    expect(r.errors.map((error) => error.message).join(' ')).toBe('');
    expect(r.valid).toBe(true);
  });
});
