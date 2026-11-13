import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/cfdiXsdValidate', () => ({
  validateCfdiXmlAgainstXsd: vi.fn(async () => ({
    valid: false,
    errors: ['no'],
    mode: 'lite' as const,
  })),
  formatCfdiXsdRejection: () => 'No se pudo leer este XML.',
}));

import { parseCfdiXmlBatch } from './cfdiBatchImportService';
import type { CfdiParseProgressUpdate } from './cfdiBatchImportService';

describe('parseCfdiXmlBatch onProgress', () => {
  it('cambia el archivo en turno y current sube de 1 a N', async () => {
    const updates: CfdiParseProgressUpdate[] = [];
    await parseCfdiXmlBatch(
      [
        { fileName: 'uno.xml', xmlText: '<cfdi/>' },
        { fileName: 'dos.xml', xmlText: '<cfdi/>' },
        { fileName: 'tres.xml', xmlText: '<cfdi/>' },
      ],
      (update) => {
        updates.push(update);
      }
    );

    expect(updates.map((update) => update.current)).toEqual([1, 2, 3]);
    expect(updates.map((update) => update.fileName)).toEqual([
      'uno.xml',
      'dos.xml',
      'tres.xml',
    ]);
    expect(updates.map((update) => update.total)).toEqual([3, 3, 3]);
    expect(updates[1]?.message).toBe('Leyendo 2/3');
  });
});
