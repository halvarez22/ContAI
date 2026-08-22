/**
 * Provider mock E6.1 — no habla al SAT. Solo fixtures deterministas.
 */

import type {
  SatDownloadProvider,
  SatDownloadRequest,
  SatDownloadResult,
  SatCfdiPackage,
} from '../../types/satDownload';
import {
  buildMalformedCfdiXml,
  buildMinimalCfdi40Xml,
} from './mockCfdiFixtures';

function inRange(fechaIso: string, inicio: string, fin: string): boolean {
  const d = fechaIso.slice(0, 10);
  return d >= inicio && d <= fin;
}

export type MockSatDownloadOptions = {
  /** Incluye 1 XML mal formado para probar resiliencia del batch. */
  includeMalformed?: boolean;
};

export function createMockSatDownloadProvider(
  options: MockSatDownloadOptions = {}
): SatDownloadProvider {
  const includeMalformed = options.includeMalformed ?? false;

  return {
    id: 'mock',
    async download(req: SatDownloadRequest): Promise<SatDownloadResult> {
      const rfc = req.rfc.trim().toUpperCase();
      const packages: SatCfdiPackage[] = [];

      const candidates: Array<{
        day: string;
        uuid: string;
        subtotal: number;
        iva: number;
        total: number;
        tipo: 'I' | 'E';
        concepto: string;
        asEmitido: boolean;
      }> = [
        {
          day: req.fechaInicio,
          uuid: 'A1111111-1111-4111-8111-111111111111',
          subtotal: 1000,
          iva: 160,
          total: 1160,
          tipo: 'I',
          concepto: 'Servicio profesional mock SAT',
          asEmitido: true,
        },
        {
          day: req.fechaFin,
          uuid: 'B2222222-2222-4222-8222-222222222222',
          subtotal: 500,
          iva: 80,
          total: 580,
          tipo: 'E',
          concepto: 'Compra insumos mock SAT',
          asEmitido: false,
        },
      ];

      for (const c of candidates) {
        if (!inRange(c.day, req.fechaInicio, req.fechaFin)) continue;
        if (req.tipo === 'emitidos' && !c.asEmitido) continue;
        if (req.tipo === 'recibidos' && c.asEmitido) continue;

        const emisorRfc = c.asEmitido ? rfc : 'XAXX010101000';
        const receptorRfc = c.asEmitido ? 'XAXX010101000' : rfc;
        const fecha = `${c.day}T12:00:00`;
        const xmlText = buildMinimalCfdi40Xml({
          uuid: c.uuid,
          fecha,
          total: c.total,
          subtotal: c.subtotal,
          iva: c.iva,
          tipoComprobante: c.tipo,
          emisorRfc,
          emisorNombre: c.asEmitido ? 'EMPRESA DEMO SA' : 'PROVEEDOR DEMO SA',
          receptorRfc,
          receptorNombre: c.asEmitido ? 'PUBLICO GENERAL' : 'EMPRESA DEMO SA',
          concepto: c.concepto,
        });
        packages.push({
          fileName: `mock-${c.uuid.slice(0, 8)}.xml`,
          xmlText,
          uuid: c.uuid,
        });
      }

      if (includeMalformed) {
        packages.push({
          fileName: 'mock-malformed.xml',
          xmlText: buildMalformedCfdiXml(),
        });
      }

      if (packages.length === 0) {
        return {
          ok: true,
          packages: [],
          provider: 'mock',
          message: 'Simulación: no hay CFDIs mock en el rango solicitado.',
        };
      }

      return {
        ok: true,
        packages,
        provider: 'mock',
        message: `Simulación: ${packages.length} CFDI(s) generados (sin conexión al SAT).`,
      };
    },
  };
}

/** Singleton por defecto (sin malformados). */
export const mockSatDownloadProvider = createMockSatDownloadProvider();
