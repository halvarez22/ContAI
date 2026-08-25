/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { parseCfdiXml } from './cfdiXml';
import { parseCfdiWithSatExtensions } from './cfdiPagosParser';
import {
  buildGlobalInvoiceCfdi40Xml,
  buildMinimalCfdi40Xml,
  buildTipoPComplementCfdi40Xml,
} from '../services/providers/mockCfdiFixtures';

const RFC_A = 'AAA010101AAA';
const RFC_B = 'BBB010101BBB';

describe('cfdiPagosParser', () => {
  it('extrae InformacionGlobal en factura tipo I', () => {
    const xml = buildGlobalInvoiceCfdi40Xml({
      uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      fecha: '2026-01-31T23:59:59',
      subtotal: 1000,
      iva: 160,
      total: 1160,
      periodicidad: '04',
      meses: '01',
      anio: '2026',
      emisorRfc: RFC_A,
      emisorNombre: 'Emisor Global SA',
      receptorRfc: RFC_B,
      receptorNombre: 'Receptor SA',
      concepto: 'Venta global enero',
    });

    const result = parseCfdiWithSatExtensions(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.tipoComprobante).toBe('I');
    expect(result.data.informacionGlobal).toEqual({
      periodicidad: '04',
      meses: '01',
      anio: '2026',
    });
    expect(result.data.pagos).toHaveLength(0);
  });

  it('extrae Pagos 2.0 con DoctoRelacionado en tipo P (total=0)', () => {
    const xml = buildTipoPComplementCfdi40Xml({
      uuid: '11111111-2222-3333-4444-555555555555',
      fecha: '2026-02-01T10:00:00',
      emisorRfc: RFC_A,
      emisorNombre: 'Emisor SA',
      receptorRfc: RFC_B,
      receptorNombre: 'Cliente SA',
      fechaPago: '2026-01-31T18:00:00',
      montoPago: 1000,
      documentos: [
        {
          idDocumento: 'aaaa-bbbb-cccc-dddd-111111111111',
          impSaldoAnt: 600,
          impPagado: 600,
          impSaldoInsoluto: 0,
        },
        {
          idDocumento: 'aaaa-bbbb-cccc-dddd-222222222222',
          impSaldoAnt: 500,
          impPagado: 400,
          impSaldoInsoluto: 100,
        },
      ],
    });

    const base = parseCfdiXml(xml);
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(base.data.tipoComprobante).toBe('P');
    expect(base.data.total).toBe(0);

    const result = parseCfdiWithSatExtensions(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.pagos).toHaveLength(1);
    expect(result.data.pagos[0].monto).toBe(1000);
    expect(result.data.pagos[0].documentos).toHaveLength(2);
    expect(result.data.pagos[0].documentos[0]).toMatchObject({
      idDocumento: 'aaaa-bbbb-cccc-dddd-111111111111',
      impPagado: 600,
      impSaldoInsoluto: 0,
    });
    expect(result.data.pagos[0].documentos[1].impPagado).toBe(400);
  });

  it('parseCfdiXml rechaza total=0 en tipo I (regresión I/E)', () => {
    const xml = buildMinimalCfdi40Xml({
      uuid: '12345678-1234-1234-1234-123456789012',
      fecha: '2026-01-15T12:00:00',
      subtotal: 0,
      iva: 0,
      total: 0,
      tipoComprobante: 'I',
      emisorRfc: RFC_A,
      emisorNombre: 'Emisor',
      receptorRfc: RFC_B,
      receptorNombre: 'Receptor',
      concepto: 'Invalido',
    });
    const result = parseCfdiXml(xml);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some((e) => /total/i.test(e))).toBe(true);
    }
  });
});
