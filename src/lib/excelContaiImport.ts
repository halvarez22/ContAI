/**
 * Mapea filas de los libros Excel en `data/` (CARLOS P.F.A.E., control inventarios, Utilidad ventas)
 * a borradores listos para Firestore (transacciones / productos).
 */

export type TxTipo = 'ingreso' | 'egreso';

export interface TransactionDraft {
  tipo: TxTipo;
  monto: number;
  moneda: string;
  concepto: string;
  proveedor: string;
  fecha: string;
  status: 'conciliado';
  tags: string[];
  iva_tasa?: number;
  fiscal_subtotal?: number;
  fiscal_iva?: number;
}

export interface ProductDraft {
  codigo: string;
  descripcion: string;
  unidad: string;
}

export interface ExcelImportResult {
  source: string;
  transactions: TransactionDraft[];
  products: ProductDraft[];
  warnings: string[];
}

const norm = (c: unknown) =>
  String(c ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function rowText(row: unknown[]): string {
  return row.map((c) => norm(c)).join('|');
}

/** Localiza primera fila que contiene todas las palabras clave (en cualquier celda). */
export function findHeaderRow(rows: unknown[][], keywords: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const t = rowText(rows[i] as unknown[]);
    if (keywords.every((k) => t.includes(norm(k)))) return i;
  }
  return -1;
}

export function parseMoneyMex(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value)
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/[$\s]/g, '')
    .replace(/,/g, '');
  if (!s || s === '-') return null;
  const n = parseFloat(s.replace(/^\((.+)\)$/, '-$1'));
  return Number.isFinite(n) ? n : null;
}

export function cellToIsoDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const utc = (value - 25569) * 86400 * 1000;
    const d = new Date(utc);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const s = String(value ?? '').trim();
  if (!s) return null;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const month = parseInt(mdy[1], 10);
    const day = parseInt(mdy[2], 10);
    let year = parseInt(mdy[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

function headerIndex(headerRow: unknown[], candidates: string[]): number {
  const h = (headerRow as unknown[]).map((c) => norm(c));
  for (const cand of candidates) {
    const nc = norm(cand);
    if (!nc) continue;
    const i = h.findIndex((cell) => cell.length > 0 && cell.includes(nc));
    if (i >= 0) return i;
  }
  return -1;
}

function inferIvaTasaFromTipo(tipoCell: unknown): number | undefined {
  const t = String(tipoCell ?? '').toLowerCase();
  if (/\b16\b/.test(t)) return 0.16;
  if (/\b8\b/.test(t)) return 0.08;
  if (/0\s*%/.test(t) || /\b0\b/.test(t)) return 0;
  return undefined;
}

export function mapCarlosIngresos(rows: unknown[][], sourceLabel: string): { txs: TransactionDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  // Palabras que solo aparecen en el encabezado (no en filas de datos numéricos).
  const hi = findHeaderRow(rows, ['fecha de emision', 'fecha cobro']);
  if (hi < 0) {
    warnings.push(`${sourceLabel}: hoja ING no encontrada o sin columnas esperadas (FECHA EMISIÓN / COBRO).`);
    return { txs: [], warnings };
  }
  const hdr = rows[hi] as unknown[];
  const idxCliente = headerIndex(hdr, ['cliente']);
  const idxRFC = headerIndex(hdr, ['rfc']);
  const idxTipoIva = headerIndex(hdr, ['tipo ingreso', 'tasa', 'iva']);
  const idxFechaEmision = headerIndex(hdr, ['fecha de emision', 'emision']);
  const idxFechaCobro = headerIndex(hdr, ['fecha cobro', 'cobro']);
  const idxImporte = headerIndex(hdr, ['importe']);
  const idxIva = headerIndex(hdr, ['iva']);
  const idxTotal = headerIndex(hdr, ['total']);

  if (idxCliente < 0 || idxTotal < 0) {
    warnings.push(`${sourceLabel}: columnas CLIENTE o TOTAL no localizadas.`);
    return { txs: [], warnings };
  }

  const txs: TransactionDraft[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const cliente = String(row[idxCliente] ?? '').trim();
    const total = parseMoneyMex(row[idxTotal]);
    if (!cliente || total === null || total <= 0) continue;

    const fecha =
      cellToIsoDate(row[idxFechaCobro >= 0 ? idxFechaCobro : -1]) ||
      cellToIsoDate(row[idxFechaEmision >= 0 ? idxFechaEmision : -1]);
    if (!fecha) {
      warnings.push(`${sourceLabel} fila ${r + 1}: sin fecha válida, omitida.`);
      continue;
    }

    const iva = parseMoneyMex(row[idxIva >= 0 ? idxIva : -1]) ?? 0;
    const subtotal = parseMoneyMex(row[idxImporte >= 0 ? idxImporte : -1]);
    const iva_tasa = idxTipoIva >= 0 ? inferIvaTasaFromTipo(row[idxTipoIva]) : undefined;

    const rfc = idxRFC >= 0 ? String(row[idxRFC] ?? '').trim() : '';
    const concepto = [cliente, rfc ? `RFC ${rfc}` : ''].filter(Boolean).join(' · ');

    txs.push({
      tipo: 'ingreso',
      monto: total,
      moneda: 'MXN',
      concepto,
      proveedor: cliente,
      fecha,
      status: 'conciliado',
      tags: ['import-excel', 'carlos-ing'],
      ...(iva_tasa !== undefined ? { iva_tasa } : {}),
      ...(subtotal !== null && subtotal > 0 ? { fiscal_subtotal: subtotal, fiscal_iva: iva } : {}),
    });
  }
  return { txs, warnings };
}

export function mapCarlosEgresos(rows: unknown[][], sourceLabel: string): { txs: TransactionDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  const hi = findHeaderRow(rows, ['proveedor', 'factura']);
  if (hi < 0) {
    warnings.push(`${sourceLabel}: hoja EGR no encontrada o sin columnas esperadas (PROVEEDOR / FACTURA).`);
    return { txs: [], warnings };
  }
  const hdr = rows[hi] as unknown[];
  const idxProv = headerIndex(hdr, ['proveedor']);
  const idxFecha = headerIndex(hdr, ['fecha']);
  const idxFact = headerIndex(hdr, ['factura']);
  const idxGasto = headerIndex(hdr, ['gasto total']);
  const idxIva = headerIndex(hdr, ['iva']);
  const idxMontoTotal = headerIndex(hdr, ['monto total']);
  const idxTotal = headerIndex(hdr, ['total']);

  if (idxProv < 0 || idxFecha < 0) {
    warnings.push(`${sourceLabel}: columnas PROVEEDOR o FECHA no localizadas.`);
    return { txs: [], warnings };
  }

  const txs: TransactionDraft[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const proveedor = String(row[idxProv] ?? '').trim();
    if (!proveedor) continue;

    const fecha = cellToIsoDate(row[idxFecha]);
    if (!fecha) continue;

    const monto =
      (idxMontoTotal >= 0 ? parseMoneyMex(row[idxMontoTotal]) : null) ??
      (idxTotal >= 0 ? parseMoneyMex(row[idxTotal]) : null) ??
      (idxGasto >= 0 ? parseMoneyMex(row[idxGasto]) : null);

    if (monto === null || monto <= 0) continue;

    const fact = idxFact >= 0 ? String(row[idxFact] ?? '').trim() : '';
    const iva = idxIva >= 0 ? parseMoneyMex(row[idxIva]) ?? 0 : 0;
    const gastoSub = idxGasto >= 0 ? parseMoneyMex(row[idxGasto]) : null;

    const concepto = [proveedor, fact ? `Fact. ${fact}` : ''].filter(Boolean).join(' · ');

    txs.push({
      tipo: 'egreso',
      monto,
      moneda: 'MXN',
      concepto,
      proveedor,
      fecha,
      status: 'conciliado',
      tags: ['import-excel', 'carlos-egr'],
      ...(gastoSub !== null && gastoSub > 0 ? { fiscal_subtotal: gastoSub, fiscal_iva: iva } : {}),
    });
  }
  return { txs, warnings };
}

const CODIGO_RE = /^[A-Za-z0-9\-_.]+$/;

export function mapInventoryProducts(rows: unknown[][], sourceLabel: string): { products: ProductDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  const hi = findHeaderRow(rows, ['codigo de producto', 'descripcion']);
  if (hi < 0) {
    warnings.push(`${sourceLabel}: hoja inventario sin encabezado Codigo/Descripcion.`);
    return { products: [], warnings };
  }
  const hdr = rows[hi] as unknown[];
  const idxCod = headerIndex(hdr, ['codigo de producto', 'codigo']);
  const idxDesc = headerIndex(hdr, ['descripcion']);
  if (idxCod < 0 || idxDesc < 0) {
    warnings.push(`${sourceLabel}: columnas código o descripción no encontradas.`);
    return { products: [], warnings };
  }

  const seen = new Set<string>();
  const products: ProductDraft[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const codigo = String(row[idxCod] ?? '').trim();
    const descripcion = String(row[idxDesc] ?? '').trim();
    if (!codigo || !descripcion) continue;
    if (!CODIGO_RE.test(codigo) || codigo.length > 64) continue;
    const key = `${codigo}::${descripcion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push({ codigo, descripcion, unidad: 'PZA' });
  }
  return { products, warnings };
}

export function mapUtilidadVentas(rows: unknown[][], sourceLabel: string): { txs: TransactionDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  const hi = findHeaderRow(rows, ['descripcion', 'total', 'subtotal']);
  if (hi < 0) {
    warnings.push(`${sourceLabel}: Hoja1 sin columnas DESCRIPCION / TOTAL.`);
    return { txs: [], warnings };
  }
  const hdr = rows[hi] as unknown[];
  const idxFecha = headerIndex(hdr, ['fecha']);
  const idxCliente = headerIndex(hdr, ['cliente']);
  const idxDesc = headerIndex(hdr, ['descripcion']);
  const idxTot = headerIndex(hdr, ['total']);
  const idxSub = headerIndex(hdr, ['subtotal2', 'subtotal']);

  if (idxDesc < 0 || idxTot < 0) {
    warnings.push(`${sourceLabel}: TOTAL o DESCRIPCION no localizados.`);
    return { txs: [], warnings };
  }

  const txs: TransactionDraft[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const desc = String(row[idxDesc] ?? '').trim();
    const total = parseMoneyMex(row[idxTot]);
    if (!desc || total === null || total <= 0) continue;

    const fecha =
      (idxFecha >= 0 ? cellToIsoDate(row[idxFecha]) : null) ||
      cellToIsoDate(row[0]);
    if (!fecha) continue;

    const cliente = idxCliente >= 0 ? String(row[idxCliente] ?? '').trim() : '';
    const sub = idxSub >= 0 ? parseMoneyMex(row[idxSub]) : null;

    txs.push({
      tipo: 'ingreso',
      monto: total,
      moneda: 'MXN',
      concepto: [desc, cliente].filter(Boolean).join(' · '),
      proveedor: cliente || 'Público general',
      fecha,
      status: 'conciliado',
      tags: ['import-excel', 'utilidad-ventas'],
      ...(sub !== null && sub > 0 ? { fiscal_subtotal: sub } : {}),
    });
  }
  return { txs, warnings };
}
