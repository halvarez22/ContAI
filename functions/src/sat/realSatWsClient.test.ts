import { describe, expect, it, vi } from 'vitest';
import {
  createRealSatWsClientFromEngine,
  type SatSoapEngine,
  SatWsClientError,
} from './realSatWsClient';

function fakeEngine(overrides: Partial<SatSoapEngine> = {}): SatSoapEngine {
  return {
    async queryIssued() {
      return {
        accepted: true,
        requestId: 'REQ-EMIT',
        statusCode: 5000,
        message: 'Solicitud recibida con éxito',
      };
    },
    async queryReceived() {
      return {
        accepted: true,
        requestId: 'REQ-REC',
        statusCode: 5000,
        message: 'Solicitud recibida con éxito',
      };
    },
    async verify() {
      return {
        callAccepted: true,
        statusRequest: 'Terminada',
        packageIds: ['PKG-1'],
        numberCfdis: 1,
        statusCode: 5000,
        message: 'ok',
      };
    },
    async download() {
      return {
        accepted: true,
        content: Buffer.from('zip'),
        statusCode: 5000,
        message: 'ok',
      };
    },
    dispose() {},
    ...overrides,
  };
}

describe('createRealSatWsClientFromEngine', () => {
  it('solicitar emitidos y verificar/descargar', async () => {
    const client = createRealSatWsClientFromEngine(fakeEngine());
    const { requestId } = await client.solicitar({
      rfc: 'AAA010101AAA',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-01-31',
      tipo: 'emitidos',
    });
    expect(requestId).toBe('REQ-EMIT');
    const ver = await client.verificar(requestId);
    expect(ver.state).toBe('Terminada');
    expect(ver.packageIds).toEqual(['PKG-1']);
    const buf = await client.descargar('PKG-1');
    expect(buf.toString()).toBe('zip');
  });

  it('reintenta una vez ante error de red', async () => {
    let calls = 0;
    const engine = fakeEngine({
      async verify() {
        calls += 1;
        if (calls === 1) {
          throw new Error('ETIMEDOUT connecting to SAT');
        }
        return {
          callAccepted: true,
          statusRequest: 'EnProceso',
          packageIds: [],
          numberCfdis: 0,
          statusCode: 5000,
          message: 'en proceso',
        };
      },
    });
    const client = createRealSatWsClientFromEngine(engine);
    const ver = await client.verificar('REQ');
    expect(ver.state).toBe('EnProceso');
    expect(calls).toBe(2);
  });

  it('falla SAT_AUTH cuando solicitud no aceptada con código auth', async () => {
    const client = createRealSatWsClientFromEngine(
      fakeEngine({
        async queryIssued() {
          return {
            accepted: false,
            requestId: '',
            statusCode: 5001,
            message: 'Error de autenticación',
          };
        },
      })
    );
    await expect(
      client.solicitar({
        rfc: 'AAA010101AAA',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-01-31',
        tipo: 'emitidos',
      })
    ).rejects.toBeInstanceOf(SatWsClientError);
  });
});

describe('withRetries isolation', () => {
  it('no reintenta indefinidamente', async () => {
    const spy = vi.fn(async () => {
      throw new Error('permanent failure xyz');
    });
    const client = createRealSatWsClientFromEngine(
      fakeEngine({
        verify: spy,
      })
    );
    await expect(client.verificar('x')).rejects.toBeInstanceOf(SatWsClientError);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
