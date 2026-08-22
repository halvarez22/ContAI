/**
 * Cliente WS Descarga Masiva — interfaz + mock determinista (E6.2).
 * RealSatWsClient (SOAP) = E6.2.1.
 */

export type SatWsVerifyState =
  | 'Aceptada'
  | 'EnProceso'
  | 'Terminada'
  | 'Error'
  | 'Rechazada';

export interface SatWsClient {
  readonly id: 'mock_ws' | 'sat_ws';
  solicitar(params: {
    rfc: string;
    fechaInicio: string;
    fechaFin: string;
    tipo: string;
  }): Promise<{ requestId: string }>;
  verificar(requestId: string): Promise<{
    state: SatWsVerifyState;
    packageIds: string[];
  }>;
  descargar(packageId: string): Promise<Buffer>;
}

/** Mock: 2 verificaciones EnProceso, luego Terminada; ZIP con 1 XML mínimo. */
export function createMockSatWsClient(options?: {
  verifyCallsBeforeDone?: number;
}): SatWsClient {
  const need = options?.verifyCallsBeforeDone ?? 2;
  const verifyCounts = new Map<string, number>();

  return {
    id: 'mock_ws',
    async solicitar() {
      const requestId = `MOCK-REQ-${Date.now()}`;
      verifyCounts.set(requestId, 0);
      return { requestId };
    },
    async verificar(requestId: string) {
      const n = (verifyCounts.get(requestId) ?? 0) + 1;
      verifyCounts.set(requestId, n);
      if (n < need) {
        return { state: 'EnProceso', packageIds: [] };
      }
      return { state: 'Terminada', packageIds: [`PKG-${requestId}`] };
    },
    async descargar(packageId: string) {
      // ZIP mínimo válido (local file header + central directory vacío no — usar JSZip en caller)
      // Devolvemos un marcador que zipUnpack reconoce como "mock-xml-bundle"
      const marker = Buffer.from(
        JSON.stringify({
          mockZip: true,
          packageId,
          xmls: [
            {
              fileName: 'mock-sat-1.xml',
              xmlText: minimalCfdiXml(),
              uuid: 'D4444444-4444-4444-8444-444444444444',
            },
          ],
        }),
        'utf8'
      );
      return marker;
    },
  };
}

function minimalCfdiXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Fecha="2026-01-15T12:00:00" SubTotal="100.00" Moneda="MXN" Total="116.00"
  TipoDeComprobante="I" LugarExpedicion="06600">
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="MOCK EMISOR" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="ABC010101AAA" Nombre="MOCK RECEPTOR" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="616" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="Mock SAT WS" ValorUnitario="100.00" Importe="100.00" ObjetoImp="02"/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;
}
