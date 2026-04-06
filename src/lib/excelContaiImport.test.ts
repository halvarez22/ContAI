import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseContaiExcelBuffer, mergeExcelResults } from './excelContaiImportXlsx';
import { parseMoneyMex, cellToIsoDate } from './excelContaiImport';

const dataDir = join(process.cwd(), 'data');

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('excelContaiImport helpers', () => {
  it('parseMoneyMex', () => {
    expect(parseMoneyMex('$1,350.70')).toBe(1350.7);
    expect(parseMoneyMex(' $33,524.00 ')).toBe(33524);
  });

  it('cellToIsoDate slash', () => {
    const iso = cellToIsoDate('1/2/24');
    expect(iso).toBeTruthy();
    expect(new Date(iso!).getFullYear()).toBe(2024);
  });
});

describe('parseContaiExcelBuffer (data/*.xlsx)', () => {
  it('CARLOS: ingresos y egresos', () => {
    const buf = readFileSync(join(dataDir, 'CARLOS P.F.A.E. copia.xlsx'));
    const r = parseContaiExcelBuffer(toArrayBuffer(buf), 'CARLOS P.F.A.E. copia.xlsx');
    expect(r.transactions.length).toBeGreaterThan(100);
    expect(r.transactions.filter((t) => t.tipo === 'ingreso').length).toBeGreaterThan(10);
    expect(r.transactions.filter((t) => t.tipo === 'egreso').length).toBeGreaterThan(10);
  });

  it('control inventarios: productos', () => {
    const buf = readFileSync(join(dataDir, 'control inventarios copia.xlsx'));
    const r = parseContaiExcelBuffer(toArrayBuffer(buf), 'control inventarios copia.xlsx');
    expect(r.products.length).toBeGreaterThan(5);
    expect(r.products.some((p) => p.codigo === '35')).toBe(true);
  });

  it('Utilidad de ventas: líneas Hoja1', () => {
    const buf = readFileSync(join(dataDir, 'Utilidad de ventas copia.xlsx'));
    const r = parseContaiExcelBuffer(toArrayBuffer(buf), 'Utilidad de ventas copia.xlsx');
    expect(r.transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('mergeExcelResults combina los tres archivos', () => {
    const files = [
      'CARLOS P.F.A.E. copia.xlsx',
      'control inventarios copia.xlsx',
      'Utilidad de ventas copia.xlsx',
    ];
    const merged = mergeExcelResults(
      files.map((name) =>
        parseContaiExcelBuffer(toArrayBuffer(readFileSync(join(dataDir, name))), name)
      )
    );
    expect(merged.transactions.length).toBeGreaterThan(100);
    expect(merged.products.length).toBeGreaterThan(0);
  });
});
