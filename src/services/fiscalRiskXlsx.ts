/**
 * Parse Excel 69-B con import dinámico de SheetJS (H2).
 * Mantiene `xlsx` fuera del bundle inicial de App / fiscalRiskService.
 */

import { parseFiscalRiskRows } from './fiscalRiskService';
import type { FiscalRiskParseResult } from '../types/fiscalRisk';

/**
 * Lee la primera hoja de un .xlsx/.xls → `parseFiscalRiskRows`
 * (misma `normalizeHeaderKey` que CSV).
 */
export async function parseFiscalRiskXlsxBuffer(
  buf: ArrayBuffer | Uint8Array
): Promise<FiscalRiskParseResult> {
  let XLSX: typeof import('xlsx');
  try {
    XLSX = await import('xlsx');
  } catch {
    throw new Error(
      'No se pudo cargar el procesador de Excel. Verifica tu conexión.'
    );
  }

  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName || !wb.Sheets[sheetName]) {
    return { entries: [], errors: [{ row: 0, message: 'Libro Excel sin hojas' }] };
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    defval: '',
    raw: false,
  }) as Record<string, unknown>[];
  return parseFiscalRiskRows(rows);
}
