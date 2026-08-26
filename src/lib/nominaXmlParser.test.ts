/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { NOMINA_MISSING_COMPLEMENT_ERROR } from '../config/nominaDefaults';
import { buildMalformedCfdiXml } from '../services/providers/mockCfdiFixtures';
import {
  buildNominaCfdi40Xml,
  buildTipoNWithoutNominaComplementXml,
} from '../services/providers/nominaCfdiFixtures';
import {
  isNominaXmlCandidate,
  parseNominaXml,
} from './nominaXmlParser';
import { mapTipoComprobanteToTxTipo } from './cfdiXml';

const sampleNominaXml = () =>
  buildNominaCfdi40Xml({
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    fecha: '2026-08-15T12:00:00',
    fechaPago: '2026-08-15',
    total: 8500,
    subtotal: 8500,
    totalPercepciones: 10000,
    totalDeducciones: 1500,
    isr: 1200,
    imss: 300,
    emisorRfc: 'EMP010101AAA',
    emisorNombre: 'Empresa Demo SA',
    empleadoRfc: 'XAXX010101000',
    empleadoNombre: 'Juan Perez',
  });

describe('mapTipoComprobanteToTxTipo (E13.1)', () => {
  it('N → egreso', () => {
    expect(mapTipoComprobanteToTxTipo('N')).toBe('egreso');
    expect(mapTipoComprobanteToTxTipo('n')).toBe('egreso');
  });
});

describe('parseNominaXml', () => {
  it('extrae nómina válida: Total, RFC empleado, ISR 002 e IMSS 001', () => {
    const xml = sampleNominaXml();
    expect(isNominaXmlCandidate(xml)).toBe(true);
    const r = parseNominaXml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.total).toBe(8500);
    expect(r.data.empleadoRfc).toBe('XAXX010101000');
    expect(r.data.empleadoNombre).toBe('Juan Perez');
    expect(r.data.isrRetenido).toBe(1200);
    expect(r.data.imssRetenido).toBe(300);
    expect(r.data.totalPercepciones).toBe(10000);
    expect(r.data.totalDeducciones).toBe(1500);
    expect(r.data.cfdiUuid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('Tipo N sin complemento → error explícito', () => {
    const xml = buildTipoNWithoutNominaComplementXml({
      uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fecha: '2026-08-15T12:00:00',
      total: 1000,
      emisorRfc: 'EMP010101AAA',
      empleadoRfc: 'XAXX010101000',
    });
    expect(isNominaXmlCandidate(xml)).toBe(true);
    const r = parseNominaXml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain(NOMINA_MISSING_COMPLEMENT_ERROR);
  });

  it('XML malformado → error', () => {
    const r = parseNominaXml(buildMalformedCfdiXml());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
