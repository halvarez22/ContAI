/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  appendNominaIsr,
  formatCfdiFiscalFace,
  readCfdiFiscalFace,
} from './cfdiFiscalFace';

const UUID = '11111111-1111-1111-1111-111111111111';

function xml(attrs: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" ${attrs}>
  ${body}
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${UUID}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

function receptor(uso: string): string {
  return `<cfdi:Receptor Rfc="BBB010101BBB" Nombre="Receptor" UsoCFDI="${uso}"/>`;
}

function traslado(factor: string, tasa: string, importe: string): string {
  const tasaAttr = factor === 'Exento' ? '' : ` TasaOCuota="${tasa}" Importe="${importe}"`;
  return `<cfdi:Traslado Base="1000" Impuesto="002" TipoFactor="${factor}"${tasaAttr}/>`;
}

function impuestos(inner: string): string {
  return `<cfdi:Impuestos>${inner}</cfdi:Impuestos>`;
}

describe('readCfdiFiscalFace', () => {
  it('distingue IVA 16 %, tasa 0 % y exento', () => {
    const tasa16 = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="1160" TipoDeComprobante="I"',
        `${receptor('G03')}${impuestos(`<cfdi:Traslados>${traslado('Tasa', '0.160000', '160.00')}</cfdi:Traslados>`)}`
      )
    );
    const tasa0 = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="1000" TipoDeComprobante="I"',
        `${receptor('G03')}${impuestos(`<cfdi:Traslados>${traslado('Tasa', '0.000000', '0.00')}</cfdi:Traslados>`)}`
      )
    );
    const exento = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="1000" TipoDeComprobante="I"',
        `${receptor('G03')}${impuestos(`<cfdi:Traslados>${traslado('Exento', '', '')}</cfdi:Traslados>`)}`
      )
    );
    expect(tasa16).not.toBeNull();
    expect(tasa0).not.toBeNull();
    expect(exento).not.toBeNull();
    const text16 = formatCfdiFiscalFace(tasa16!);
    const text0 = formatCfdiFiscalFace(tasa0!);
    const textExento = formatCfdiFiscalFace(exento!);
    expect(text16).toContain('IVA 16%');
    expect(text16).toContain('160.00');
    expect(text0).toContain('Tasa 0%');
    expect(text0).not.toContain('IVA 16%');
    expect(textExento).toContain('Exento');
    expect(textExento).not.toContain('Tasa 0%');
    expect(textExento).not.toContain('IVA 16%');
  });

  it('lee la tasa 0.106667 como IVA 2/3 y no como IVA 8%', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="1106.67" TipoDeComprobante="I"',
        `${receptor('G03')}${impuestos(`<cfdi:Traslados>${traslado('Tasa', '0.106667', '106.67')}</cfdi:Traslados>`)}`
      )
    );
    expect(face).not.toBeNull();
    const text = formatCfdiFiscalFace(face!);
    expect(text).toContain('IVA 2/3');
    expect(text).toContain('106.67');
    expect(text).not.toContain('IVA 8%');
  });

  it('conserva el ISR retenido al 10 % y su importe', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="900" TipoDeComprobante="I"',
        `${receptor('G03')}${impuestos(`<cfdi:Retenciones><cfdi:Retencion Base="1000" Impuesto="001" TipoFactor="Tasa" TasaOCuota="0.100000" Importe="100.00"/></cfdi:Retenciones>`)}`
      )
    );
    expect(face).not.toBeNull();
    const text = formatCfdiFiscalFace(face!);
    expect(text).toContain('ISR retenido 10%');
    expect(text).toContain('100.00');
  });

  it('omite el descuento en cero y muestra el descuento con importe', () => {
    const sinDescuento = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Descuento="0" Total="1000" TipoDeComprobante="I"',
        receptor('G03')
      )
    );
    const conDescuento = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Descuento="50.00" Total="950" TipoDeComprobante="I"',
        receptor('G03')
      )
    );
    expect(formatCfdiFiscalFace(sinDescuento!)).not.toContain('Descuento');
    expect(formatCfdiFiscalFace(conDescuento!)).toContain('Descuento: 50.00');
  });

  it('marca nota de crédito con uso G02 y egreso cuando el E no lo trae', () => {
    const nota = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="100" Total="100" TipoDeComprobante="E"',
        receptor('G02')
      )
    );
    const egreso = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="100" Total="100" TipoDeComprobante="E"',
        receptor('G03')
      )
    );
    expect(formatCfdiFiscalFace(nota!)).toContain('Tipo: Nota de crédito');
    expect(formatCfdiFiscalFace(egreso!)).toContain('Tipo: Egreso');
    expect(formatCfdiFiscalFace(egreso!)).not.toContain('Nota de crédito');
  });

  it('marca nota de crédito cuando el egreso relaciona un comprobante con tipo 01', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="100" Total="100" TipoDeComprobante="E"',
        `${receptor('G03')}<cfdi:CfdiRelacionados TipoRelacion="01"><cfdi:CfdiRelacionado UUID="33333333-3333-3333-3333-333333333333"/></cfdi:CfdiRelacionados>`
      )
    );
    expect(formatCfdiFiscalFace(face!)).toContain('Tipo: Nota de crédito');
  });

  it('escribe serie, folio y folio fiscal', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Serie="A" Folio="100" Fecha="2026-08-01T12:00:00" SubTotal="100" Total="100" TipoDeComprobante="I"',
        receptor('G03')
      )
    );
    const text = formatCfdiFiscalFace(face!);
    expect(text).toContain('Folio: A 100');
    expect(text).toContain(`Folio fiscal: ${UUID}`);
  });

  it('lee serie, folio y descuento de una nómina cuando el XML los trae', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Serie="NOM" Folio="9" Descuento="12.50" Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="800" TipoDeComprobante="N"',
        receptor('CN01')
      )
    );
    expect(face).not.toBeNull();
    const text = formatCfdiFiscalFace(face!);
    expect(text).toContain('Tipo: Nómina');
    expect(text).toContain('Folio: NOM 9');
    expect(text).toContain('Descuento: 12.50');
  });

  it('no inventa serie, folio ni descuento si la nómina no los trae', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="800" TipoDeComprobante="N"',
        receptor('CN01')
      )
    );
    const text = formatCfdiFiscalFace(face!);
    expect(text).toContain('Tipo: Nómina');
    expect(text).not.toContain('Folio:');
    expect(text).not.toContain('Descuento');
  });

  it('agrega el ISR de nómina cuando el XML no trae el nodo y no muta la ficha', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="800" TipoDeComprobante="N"',
        receptor('CN01')
      )
    );
    expect(face).not.toBeNull();
    const before = structuredClone(face);
    const next = appendNominaIsr(face!, 80);
    expect(face).toEqual(before);
    expect(next).not.toBe(face);
    expect(next.impuestos).toHaveLength(1);
    expect(next.impuestos[0]).toEqual({
      nombre: 'ISR',
      naturaleza: 'retencion',
      tipoFactor: 'Tasa',
      tasa: null,
      importe: 80,
    });
    expect(formatCfdiFiscalFace(next)).toContain('ISR retenido · 80.00');
  });

  it('no duplica el ISR si el XML de nómina ya lo trae', () => {
    const face = readCfdiFiscalFace(
      xml(
        'Fecha="2026-08-01T12:00:00" SubTotal="1000" Total="800" TipoDeComprobante="N"',
        `${receptor('CN01')}${impuestos(`<cfdi:Retenciones><cfdi:Retencion Base="1000" Impuesto="001" TipoFactor="Tasa" TasaOCuota="0.100000" Importe="100.00"/></cfdi:Retenciones>`)}`
      )
    );
    const next = appendNominaIsr(face!, 80);
    expect(next).toBe(face);
    expect(next.impuestos.filter((line) => line.nombre === 'ISR')).toHaveLength(1);
    expect(formatCfdiFiscalFace(next)).toContain('ISR retenido 10%');
    expect(formatCfdiFiscalFace(next)).not.toContain('80.00');
  });
});
