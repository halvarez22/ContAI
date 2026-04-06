import * as XLSX from 'xlsx';
import {
  mapCarlosEgresos,
  mapCarlosIngresos,
  mapInventoryProducts,
  mapUtilidadVentas,
  type ExcelImportResult,
} from './excelContaiImport';

function sheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
}

/**
 * Interpreta un .xlsx según el nombre de archivo y hojas conocidas (data/ de ContAI).
 */
export function parseContaiExcelBuffer(buf: ArrayBuffer, fileName: string): ExcelImportResult {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
  const lower = fileName.toLowerCase();
  const transactions: ExcelImportResult['transactions'] = [];
  const products: ExcelImportResult['products'] = [];
  const warnings: string[] = [];

  if (lower.includes('carlos')) {
    const ingName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'ING');
    const egrName = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'EGR');
    if (ingName && wb.Sheets[ingName]) {
      const { txs, warnings: w } = mapCarlosIngresos(sheetToRows(wb.Sheets[ingName]), `${fileName}/ING`);
      transactions.push(...txs);
      warnings.push(...w);
    } else {
      warnings.push(`${fileName}: no se encontró la hoja ING.`);
    }
    if (egrName && wb.Sheets[egrName]) {
      const { txs, warnings: w } = mapCarlosEgresos(sheetToRows(wb.Sheets[egrName]), `${fileName}/EGR`);
      transactions.push(...txs);
      warnings.push(...w);
    } else {
      warnings.push(`${fileName}: no se encontró la hoja EGR.`);
    }
  }

  if (lower.includes('inventario') || lower.includes('control invent')) {
    const stockName =
      wb.SheetNames.find((n) => n.toLowerCase().includes('menudeo') && n.toLowerCase().includes('stock')) ||
      wb.SheetNames.find((n) => n.toLowerCase().includes('inventario'));
    if (stockName && wb.Sheets[stockName]) {
      const { products: p, warnings: w } = mapInventoryProducts(
        sheetToRows(wb.Sheets[stockName]),
        `${fileName}/${stockName}`
      );
      products.push(...p);
      warnings.push(...w);
    } else {
      warnings.push(`${fileName}: no se encontró hoja de inventario (vtas menudeo y stock).`);
    }
  }

  if (lower.includes('utilidad')) {
    const hojaName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'hoja1') || 'Hoja1';
    const sh = wb.Sheets[hojaName];
    if (sh) {
      const { txs, warnings: w } = mapUtilidadVentas(sheetToRows(sh), `${fileName}/ventas-detalle`);
      transactions.push(...txs);
      warnings.push(...w);
    } else {
      warnings.push(`${fileName}: no se encontró la hoja Hoja1 con el detalle de ventas.`);
    }
  }

  if (!lower.includes('carlos') && !lower.includes('inventario') && !lower.includes('control invent') && !lower.includes('utilidad')) {
    warnings.push(
      `${fileName}: nombre no reconocido. Usa archivos como los de data/: *CARLOS*, *inventario*, *Utilidad*.`
    );
  }

  return {
    source: fileName,
    transactions,
    products,
    warnings,
  };
}

export function mergeExcelResults(results: ExcelImportResult[]): ExcelImportResult {
  const transactions = results.flatMap((r) => r.transactions);
  const products = results.flatMap((r) => r.products);
  const warnings = results.flatMap((r) => r.warnings);
  return {
    source: results.map((r) => r.source).join(' + '),
    transactions,
    products,
    warnings,
  };
}
