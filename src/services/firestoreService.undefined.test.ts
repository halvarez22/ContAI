import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CfdiExtracted } from '../lib/cfdiXml';

const { batchSet, batchCommit, addDocMock, timestampSentinel, deleteSentinel } = vi.hoisted(() => {
  class Sentinel {
    constructor(readonly kind: string) {}
  }
  return {
    batchSet: vi.fn<(ref: unknown, data: Record<string, unknown>) => void>(),
    batchCommit: vi.fn(async () => undefined),
    addDocMock: vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<{ id: string }>>(
      async () => ({ id: 'alta-1' })
    ),
    timestampSentinel: new Sentinel('server-timestamp'),
    deleteSentinel: new Sentinel('delete-field'),
  };
});

vi.mock('../firebase', () => ({ db: { kind: 'db' } }));

vi.mock('firebase/firestore', () => ({
  addDoc: (ref: unknown, data: Record<string, unknown>) => addDocMock(ref, data),
  collection: () => ({ path: 'transactions' }),
  doc: () => ({ id: 'lote-1' }),
  getDocs: vi.fn(),
  query: vi.fn(),
  deleteField: () => deleteSentinel,
  serverTimestamp: () => timestampSentinel,
  setDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: () => ({ set: batchSet, commit: batchCommit }),
}));

import { buildSingleCfdiCreatePayload } from '../lib/cfdiSingleImportPayload';
import { commitCfdiTransactionBatch, createTransaction } from './firestoreService';

function expectNoUndefinedDeep(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) expectNoUndefinedDeep(item);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    expect(record[key]).not.toBeUndefined();
    expectNoUndefinedDeep(record[key]);
  }
}

function extractedWithoutFormaPago(): CfdiExtracted {
  return {
    version: '4.0',
    fecha: '2026-01-15T12:00:00',
    tipoComprobante: 'I',
    subtotal: 1000,
    total: 1160,
    moneda: 'MXN',
    metodoPago: 'PUE',
    formaPago: '',
    lugarExpedicion: '64000',
    emisorRfc: 'AAA010101AAA',
    emisorNombre: 'Emisor SA',
    emisorRegimen: '601',
    receptorRfc: 'BBB010101BBB',
    receptorNombre: 'Receptor SA',
    receptorUsoCfdi: 'G03',
    totalIvaTrasladado: 160,
    uuid: '12345678-1234-1234-1234-123456789012',
    descripcionPrimerConcepto: 'Servicio de prueba',
    claveProdServ: '',
  };
}

describe('escritores de transacciones sin undefined', () => {
  beforeEach(() => {
    batchSet.mockClear();
    batchCommit.mockClear();
    addDocMock.mockClear();
  });

  it('T11 commitCfdiTransactionBatch entrega el lote sin undefined y conserva creado_en', async () => {
    await commitCfdiTransactionBatch([
      {
        payload: {
          organization_id: 'org',
          monto: 1160,
          forma_pago_sat: undefined,
          es_anticipo: undefined,
        },
      },
      {
        payload: {
          organization_id: 'org',
          monto: 500,
          forma_pago_sat: '03',
          es_anticipo: undefined,
        },
      },
    ]);

    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    const first = batchSet.mock.calls[0]?.[1];
    const second = batchSet.mock.calls[1]?.[1];
    if (!first || !second) throw new Error('batch.set no recibió los dos documentos');
    expectNoUndefinedDeep(first);
    expectNoUndefinedDeep(second);
    expect(first.creado_en).toBe(timestampSentinel);
    expect(second.creado_en).toBe(timestampSentinel);
    expect('forma_pago_sat' in first).toBe(false);
    expect('es_anticipo' in first).toBe(false);
    expect(second.forma_pago_sat).toBe('03');
    expect('es_anticipo' in second).toBe(false);
  });

  it('T12 createTransaction no entrega claves undefined de un CFDI sin forma de pago', async () => {
    const payload = buildSingleCfdiCreatePayload({
      organizationId: 'org',
      userId: 'u',
      fechaIso: '2026-01-15T18:00:00.000Z',
      extracted: extractedWithoutFormaPago(),
      face: null,
    });
    expect(payload.forma_pago_sat).toBeUndefined();

    const created = await createTransaction(payload);
    expect(created.id).toBe('alta-1');
    const written = addDocMock.mock.calls[0]?.[1];
    if (!written) throw new Error('addDoc no recibió el documento');
    expectNoUndefinedDeep(written);
    expect('forma_pago_sat' in written).toBe(false);
    expect('clave_prod_serv' in written).toBe(false);
    expect(written.creado_en).toBe(timestampSentinel);
    expect(written.metodo_pago_sat).toBe('PUE');
  });
});
