/**
 * Guardrail CI: el engine fake no debe tocar hosts del SAT.
 * (SOAP real + FIEL = staging; ver docs/SAT_STAGING.md)
 */
import { describe, expect, it, afterEach } from 'vitest';
import nock from 'nock';
import { createRealSatWsClientFromEngine, type SatSoapEngine } from './realSatWsClient';

describe('CI sin red SAT', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fake engine no dispara HTTP a dominios SAT', async () => {
    const scope = nock(/sat\.gob\.mx/).get(/.*/).reply(500, 'should-not-hit');
    const engine: SatSoapEngine = {
      async queryIssued() {
        return {
          accepted: true,
          requestId: 'R',
          statusCode: 5000,
          message: 'ok',
        };
      },
      async queryReceived() {
        return {
          accepted: true,
          requestId: 'R2',
          statusCode: 5000,
          message: 'ok',
        };
      },
      async verify() {
        return {
          callAccepted: true,
          statusRequest: 'Terminada',
          packageIds: ['P'],
          numberCfdis: 1,
          statusCode: 5000,
          message: 'ok',
        };
      },
      async download() {
        return {
          accepted: true,
          content: Buffer.from('x'),
          statusCode: 5000,
          message: 'ok',
        };
      },
      dispose() {},
    };
    const client = createRealSatWsClientFromEngine(engine);
    await client.solicitar({
      rfc: 'AAA010101AAA',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-02',
      tipo: 'emitidos',
    });
    await client.verificar('R');
    await client.descargar('P');
    expect(scope.isDone()).toBe(false);
  });
});
