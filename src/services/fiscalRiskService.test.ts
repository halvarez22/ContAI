/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  normalizeHeaderKey,
  normalizeRfc,
  FISCAL_RISK_COPY,
} from '../types/fiscalRisk';
import {
  buildFiscalRiskRfcSet,
  matchRfcAgainstRiskList,
  parseFiscalRiskCsv,
  parseFiscalRiskRows,
  parseFiscalRiskXlsxBuffer,
  upsertFiscalRiskListVersioned,
  type FiscalRiskListPersistence,
} from './fiscalRiskService';
import * as XLSX from 'xlsx';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

import { logAuditEntry } from './auditService';

describe('normalizeRfc', () => {
  it('elimina espacios, guiones y pasa a mayúsculas', () => {
    expect(normalizeRfc(' xa xx-010101-000 ')).toBe('XAXX010101000');
    expect(normalizeRfc('ABC010101XYZ')).toBe('ABC010101XYZ');
  });
});

describe('normalizeHeaderKey', () => {
  it('normaliza headers sucios del SAT', () => {
    expect(normalizeHeaderKey(' RFC ')).toBe('rfc');
    expect(normalizeHeaderKey('R.F.C.')).toBe('rfc');
    expect(normalizeHeaderKey('rfc')).toBe('rfc');
    expect(normalizeHeaderKey('Situación')).toBe('situacion');
  });
});

describe('parseFiscalRiskCsv / parseFiscalRiskRows', () => {
  it('parsea CSV con header sucio y deduplica RFC', () => {
    const csv = [
      '" R.F.C. ";Nombre;Situación',
      'XAXX010101000;Acme SA;Definitivo',
      'xaxx-010101-000;Duplicado;Definitivo',
      'ABC010101AB1;Otra;Presunto',
    ].join('\n');
    const r = parseFiscalRiskCsv(csv);
    expect(r.errors).toHaveLength(0);
    expect(r.entries).toHaveLength(2);
    expect(r.entries.map((e) => e.rfc).sort()).toEqual([
      'ABC010101AB1',
      'XAXX010101000',
    ]);
  });

  it('rechaza filas sin RFC y archivo sin columna rfc', () => {
    const noCol = parseFiscalRiskRows([{ Nombre: 'X' }]);
    expect(noCol.entries).toHaveLength(0);
    expect(noCol.errors[0]?.message).toMatch(/columna RFC/i);

    const missing = parseFiscalRiskRows([
      { RFC: 'XAXX010101000', Nombre: 'Ok' },
      { RFC: '', Nombre: 'Sin rfc' },
    ]);
    expect(missing.entries).toHaveLength(1);
    expect(missing.errors.some((e) => e.message.includes('sin RFC'))).toBe(
      true
    );
  });

  it('xlsx usa normalizeHeaderKey igual que CSV (header " R.F.C. ")', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [' R.F.C. ', 'Nombre'],
      ['XAXX010101000', 'Acme'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista');
    const u8 = new Uint8Array(
      XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
    );
    const r = parseFiscalRiskXlsxBuffer(u8);
    expect(r.errors).toHaveLength(0);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]?.rfc).toBe('XAXX010101000');
  });
});

describe('matchRfcAgainstRiskList', () => {
  const set = buildFiscalRiskRfcSet([
    { rfc: 'XAXX010101000' },
    { rfc: 'ABC010101AB1' },
  ]);

  it('match exacto positivo tras normalizar', () => {
    expect(matchRfcAgainstRiskList('xaxx-010101-000', set)).toBe(true);
  });

  it('no hace fuzzy: RFC similar distinto = negativo', () => {
    expect(matchRfcAgainstRiskList('XAXX010101001', set)).toBe(false);
    expect(matchRfcAgainstRiskList('XAXX01010100', set)).toBe(false);
  });

  it('sin rfc_contraparte = sin alerta', () => {
    expect(matchRfcAgainstRiskList(null, set)).toBe(false);
    expect(matchRfcAgainstRiskList(undefined, set)).toBe(false);
    expect(matchRfcAgainstRiskList('   ', set)).toBe(false);
  });
});

describe('FISCAL_RISK_COPY', () => {
  it('wording objetivo sin términos conclusivos', () => {
    const tip = FISCAL_RISK_COPY.tooltip('15/01/2026');
    expect(tip).toMatch(/RFC presente en la lista 69-B/i);
    expect(tip.toLowerCase()).not.toMatch(/fraudulento|no deducible|evasor/);
  });
});

describe('upsertFiscalRiskListVersioned', () => {
  beforeEach(() => {
    vi.mocked(logAuditEntry).mockClear();
  });

  it('escribe chunks y meta con version; audita upload', async () => {
    const chunks: unknown[] = [];
    const persistence: FiscalRiskListPersistence = {
      upsertEntriesChunk: vi.fn(async (docs) => {
        chunks.push(docs);
      }),
      writeMeta: vi.fn(async () => undefined),
      readMeta: vi.fn(async () => null),
      queryEntriesByVersion: vi.fn(async () => []),
    };

    const result = await upsertFiscalRiskListVersioned({
      organizationId: 'org_main',
      userId: 'u1',
      fileName: 'lista.csv',
      versionId: 'v_test',
      publishedAtLabel: '2026-01-15',
      entries: [
        { rfc: 'XAXX010101000' },
        { rfc: 'ABC010101AB1' },
      ],
      persistence,
    });

    expect(result).toEqual({ version: 'v_test', rfcCount: 2 });
    expect(persistence.upsertEntriesChunk).toHaveBeenCalled();
    expect(persistence.writeMeta).toHaveBeenCalledWith(
      'org_main',
      expect.objectContaining({
        current_version: 'v_test',
        rfc_count: 2,
        file_name: 'lista.csv',
      })
    );
    expect(logAuditEntry).toHaveBeenCalledWith(
      'FISCAL_RISK_LIST_UPLOADED',
      'fiscal_risk_list',
      expect.objectContaining({
        organization_id: 'org_main',
        rfcCount: 2,
        replacedPrevious: true,
        version: 'v_test',
      })
    );
    const firstChunk = chunks[0] as Array<{ data: { version: string } }>;
    expect(firstChunk.every((d) => d.data.version === 'v_test')).toBe(true);
  });
});
