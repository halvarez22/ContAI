import { describe, expect, it } from 'vitest';
import {
  chunkArray,
  buildCfdiTransactionDraft,
  partitionDraftsByClosedPeriod,
  BATCH_CHUNK,
} from './cfdiBatchImportService';
import type { CfdiExtracted } from '../lib/cfdiXml';
import type { CfdiTransactionDraft } from '../types/cfdiBatch';

function sampleCfdi(overrides: Partial<CfdiExtracted> = {}): CfdiExtracted {
  return {
    version: '4.0',
    fecha: '2026-01-15T12:00:00',
    tipoComprobante: 'I',
    subtotal: 1000,
    total: 1160,
    moneda: 'MXN',
    metodoPago: 'PUE',
    formaPago: '03',
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
    ...overrides,
  };
}

describe('chunkArray', () => {
  it('parte en chunks del tamaño indicado', () => {
    const chunks = chunkArray([1, 2, 3, 4, 5], 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('usa BATCH_CHUNK por defecto vía size explícito 400', () => {
    expect(BATCH_CHUNK).toBe(400);
    const items = Array.from({ length: 401 }, (_, i) => i);
    const chunks = chunkArray(items, BATCH_CHUNK);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(400);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe('buildCfdiTransactionDraft', () => {
  it('arma draft pendiente con clasificación tipada', () => {
    const r = buildCfdiTransactionDraft('user1', 'org1', 'a.xml', sampleCfdi());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.payload.status).toBe('pendiente');
    expect(r.draft.payload.monto).toBe(1160);
    expect(r.draft.payload.importado_cfdi).toBe(true);
    expect(r.draft.classification.concepto).toContain('Servicio');
    expect(r.draft.fileName).toBe('a.xml');
  });
});

describe('partitionDraftsByClosedPeriod', () => {
  it('omite drafts en periodos cerrados y acepta el resto', () => {
    const ok = buildCfdiTransactionDraft(
      'u',
      'org1',
      'ok.xml',
      sampleCfdi({ fecha: '2026-03-10T10:00:00' })
    );
    const closed = buildCfdiTransactionDraft(
      'u',
      'org1',
      'closed.xml',
      sampleCfdi({ fecha: '2026-01-05T10:00:00' })
    );
    expect(ok.ok && closed.ok).toBe(true);
    if (!ok.ok || !closed.ok) return;

    const drafts: CfdiTransactionDraft[] = [ok.draft, closed.draft];
    const { accepted, skipped } = partitionDraftsByClosedPeriod(drafts, ['2026-01']);

    expect(accepted.map((d) => d.fileName)).toEqual(['ok.xml']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].fileName).toBe('closed.xml');
    expect(skipped[0].ok).toBe(false);
    expect(skipped[0].error).toMatch(/cerrado/i);
  });
});
