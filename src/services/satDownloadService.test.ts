import { describe, expect, it, vi } from 'vitest';
import {
  packagesToBatchInputs,
  requestSatDownload,
  validateSatDownloadRequest,
} from './satDownloadService';
import { createMockSatDownloadProvider } from './providers/mockSatDownloadProvider';
import { buildMinimalCfdi40Xml } from './providers/mockCfdiFixtures';
import { parseCfdiXml } from '../lib/cfdiXml';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

function assertParseableWhenDomAvailable(xml: string, expectOk: boolean) {
  expect(xml).toContain('<?xml');
  if (typeof DOMParser === 'undefined') {
    if (expectOk) {
      expect(xml).toContain('cfdi:Comprobante');
      expect(xml).toContain('Version="4.0"');
      expect(xml).toContain('Emisor');
      expect(xml).toContain('Receptor');
      expect(xml).toContain('Concepto');
    } else {
      expect(xml).not.toContain('cfdi:Comprobante');
    }
    return;
  }
  const r = parseCfdiXml(xml);
  expect(r.ok).toBe(expectOk);
}

describe('validateSatDownloadRequest', () => {
  it('rechaza RFC vacío', () => {
    const errs = validateSatDownloadRequest({
      rfc: '',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-31',
      tipo: 'ambos',
    });
    expect(errs.some((e) => e.field === 'rfc')).toBe(true);
  });

  it('rechaza rango invertido', () => {
    const errs = validateSatDownloadRequest({
      rfc: 'ABC010101AAA',
      fechaInicio: '2026-01-31',
      fechaFin: '2026-01-01',
      tipo: 'ambos',
    });
    expect(errs.some((e) => e.field === 'rango')).toBe(true);
  });

  it('acepta request válido', () => {
    expect(
      validateSatDownloadRequest({
        rfc: 'ABC010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'recibidos',
      })
    ).toHaveLength(0);
  });
});

describe('mockSatDownloadProvider + fixtures', () => {
  it('genera XML con estructura CFDI 4.0 mínima válida', () => {
    const xml = buildMinimalCfdi40Xml({
      uuid: 'C3333333-3333-4333-8333-333333333333',
      fecha: '2026-01-15T12:00:00',
      total: 1160,
      subtotal: 1000,
      iva: 160,
      emisorRfc: 'XAXX010101000',
      emisorNombre: 'DEMO',
      receptorRfc: 'ABC010101AAA',
      receptorNombre: 'CLIENTE',
      concepto: 'Test',
    });
    assertParseableWhenDomAvailable(xml, true);
  });

  it('mapea packages a inputs de batch', async () => {
    const provider = createMockSatDownloadProvider();
    const result = await requestSatDownload(
      {
        rfc: 'ABC010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'ambos',
      },
      provider
    );
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('mock');
    expect(result.packages.length).toBeGreaterThanOrEqual(1);
    const inputs = packagesToBatchInputs(result.packages);
    expect(inputs[0]).toHaveProperty('fileName');
    expect(inputs[0]).toHaveProperty('xmlText');
    for (const p of result.packages) {
      assertParseableWhenDomAvailable(p.xmlText, true);
    }
  });

  it('puede incluir XML malformado para resiliencia', async () => {
    const provider = createMockSatDownloadProvider({ includeMalformed: true });
    const result = await requestSatDownload(
      {
        rfc: 'ABC010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'ambos',
      },
      provider
    );
    const bad = result.packages.find((p) => p.fileName.includes('malformed'));
    expect(bad).toBeTruthy();
    assertParseableWhenDomAvailable(bad!.xmlText, false);
  });
});
