/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('xlsx', async () => {
  return await vi.importActual<typeof import('xlsx')>('xlsx');
});

import { parseFiscalRiskXlsxBuffer } from './fiscalRiskXlsx';

describe('parseFiscalRiskXlsxBuffer (dynamic import)', () => {
  it('xlsx usa normalizeHeaderKey igual que CSV (header " R.F.C. ")', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [' R.F.C. ', 'Nombre'],
      ['XAXX010101000', 'Acme'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista');
    const u8 = new Uint8Array(
      XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
    );
    const r = await parseFiscalRiskXlsxBuffer(u8);
    expect(r.errors).toHaveLength(0);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]?.rfc).toBe('XAXX010101000');
  });
});
