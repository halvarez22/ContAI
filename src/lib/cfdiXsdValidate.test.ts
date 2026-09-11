import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { validateCfdiXmlAgainstXsd } from './cfdiXsdValidate';

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
  });
});
