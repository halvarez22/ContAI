/**
 * Lista 69-B: parse, match exacto, upsert versionado (E11.1 F0).
 * Sin React. Persistencia Firestore vía writeBatch en chunks ≤400.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { logAuditEntry } from './auditService';
import {
  AUDIT_FISCAL_RISK_LIST_UPLOADED,
  FISCAL_RISK_BATCH_CHUNK,
  FISCAL_RISK_LISTA_TIPO_69B,
  isLikelyValidRfcShape,
  normalizeHeaderKey,
  normalizeRfc,
  type FiscalRiskEntry,
  type FiscalRiskIndex,
  type FiscalRiskListaTipo,
  type FiscalRiskParseError,
  type FiscalRiskParseResult,
} from '../types/fiscalRisk';

const ENTRIES = 'fiscal_risk_list_entries';
const META = 'fiscal_risk_list_meta';

export function findRfcHeaderKey(
  headers: readonly string[]
): string | undefined {
  return headers.find((h) => normalizeHeaderKey(h) === 'rfc');
}

function cellString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

/**
 * Parsea filas ya tabuladas (CSV u Excel → objetos).
 * Header robusto: busca columna cuya clave normalizada sea "rfc".
 */
export function parseFiscalRiskRows(
  rows: ReadonlyArray<Record<string, unknown>>
): FiscalRiskParseResult {
  const entries: FiscalRiskEntry[] = [];
  const errors: FiscalRiskParseError[] = [];
  const seen = new Set<string>();
  let publishedAtHint: string | undefined;

  if (rows.length === 0) {
    return { entries, errors: [{ row: 0, message: 'Archivo vacío' }] };
  }

  const headerKeys = Object.keys(rows[0] ?? {});
  const rfcHeader = findRfcHeaderKey(headerKeys);
  if (!rfcHeader) {
    return {
      entries,
      errors: [
        {
          row: 0,
          message: 'No se encontró columna RFC (headers normalizados ≠ "rfc")',
        },
      ],
    };
  }

  const nombreKey = headerKeys.find((h) => {
    const k = normalizeHeaderKey(h);
    return (
      k === 'nombre' ||
      k === 'nombredelcontribuyente' ||
      k === 'razonsocial' ||
      k === 'nombrecontribuyente'
    );
  });
  const situacionKey = headerKeys.find((h) => {
    const k = normalizeHeaderKey(h);
    return k === 'situacion' || k === 'estatus' || k === 'status';
  });
  const fechaKey = headerKeys.find((h) => {
    const k = normalizeHeaderKey(h);
    return (
      k === 'fechadepublicacion' ||
      k === 'fechapublicacion' ||
      k === 'publicadoen' ||
      k === 'fecha'
    );
  });

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const rawRfc = cellString(row[rfcHeader]);
    if (!rawRfc) {
      errors.push({ row: rowNum, message: 'Fila sin RFC' });
      return;
    }
    const rfc = normalizeRfc(rawRfc);
    if (!isLikelyValidRfcShape(rfc)) {
      errors.push({
        row: rowNum,
        message: `RFC con formato inválido: ${rawRfc}`,
      });
      return;
    }
    if (seen.has(rfc)) return;
    seen.add(rfc);

    const entry: FiscalRiskEntry = { rfc };
    if (nombreKey) {
      const n = cellString(row[nombreKey]);
      if (n) entry.nombreRazonSocial = n.slice(0, 300);
    }
    if (situacionKey) {
      const s = cellString(row[situacionKey]);
      if (s) entry.situacion = s.slice(0, 80);
    }
    if (fechaKey) {
      const f = cellString(row[fechaKey]);
      if (f) {
        entry.publicadoEn = f.slice(0, 40);
        if (!publishedAtHint) publishedAtHint = entry.publicadoEn;
      }
    }
    entries.push(entry);
  });

  return { entries, errors, publishedAtHint };
}

/** CSV simple (coma o punto y coma). Primera fila = headers. */
/**
 * Lee la primera hoja de un .xlsx/.xls a objetos fila y aplica `parseFiscalRiskRows`
 * (misma `normalizeHeaderKey` que CSV — p. ej. " R.F.C. " → rfc).
 */
export function parseFiscalRiskXlsxBuffer(
  buf: ArrayBuffer | Uint8Array
): FiscalRiskParseResult {
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

export function parseFiscalRiskCsv(text: string): FiscalRiskParseResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { entries: [], errors: [{ row: 0, message: 'Archivo vacío' }] };
  }

  const sep = lines[0]!.includes(';') ? ';' : ',';
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]!);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]!);
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      row[h] = cols[j] ?? '';
    });
    rows.push(row);
  }
  return parseFiscalRiskRows(rows);
}

export function buildFiscalRiskRfcSet(
  entries: ReadonlyArray<FiscalRiskEntry>
): Set<string> {
  const set = new Set<string>();
  for (const e of entries) {
    const n = normalizeRfc(e.rfc);
    if (n) set.add(n);
  }
  return set;
}

/** Match determinista: RFC normalizado ∈ Set. Sin fuzzy. */
export function matchRfcAgainstRiskList(
  rfcContraparte: string | null | undefined,
  riskRfcs: ReadonlySet<string>
): boolean {
  if (!rfcContraparte) return false;
  const n = normalizeRfc(rfcContraparte);
  if (!n) return false;
  return riskRfcs.has(n);
}

export function createListVersionId(now = Date.now()): string {
  return `v_${now}`;
}

export function entryDocId(organizationId: string, normalizedRfc: string): string {
  return `${organizationId}_${normalizedRfc}`;
}

export type FiscalRiskListPersistence = {
  upsertEntriesChunk: (
    docs: Array<{
      id: string;
      data: Record<string, unknown>;
    }>
  ) => Promise<void>;
  writeMeta: (organizationId: string, data: Record<string, unknown>) => Promise<void>;
  readMeta: (
    organizationId: string
  ) => Promise<{ current_version: string; published_at_label?: string; rfc_count: number } | null>;
  queryEntriesByVersion: (
    organizationId: string,
    version: string
  ) => Promise<Array<{ rfc: string }>>;
};

export async function writeFiscalRiskEntriesChunkToFirestore(
  docs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  const batch = writeBatch(db);
  for (const d of docs) {
    batch.set(doc(db, ENTRIES, d.id), d.data, { merge: true });
  }
  await batch.commit();
}

export async function writeFiscalRiskMetaToFirestore(
  organizationId: string,
  data: Record<string, unknown>
): Promise<void> {
  await setDoc(doc(db, META, organizationId), data, { merge: true });
}

export async function readFiscalRiskMetaFromFirestore(
  organizationId: string
): Promise<{
  current_version: string;
  published_at_label?: string;
  rfc_count: number;
} | null> {
  const snap = await getDoc(doc(db, META, organizationId));
  if (!snap.exists()) return null;
  const data = snap.data();
  const version = String(data.current_version || '');
  if (!version) return null;
  return {
    current_version: version,
    published_at_label:
      typeof data.published_at_label === 'string'
        ? data.published_at_label
        : undefined,
    rfc_count: Number(data.rfc_count) || 0,
  };
}

export async function queryFiscalRiskEntriesByVersion(
  organizationId: string,
  version: string
): Promise<Array<{ rfc: string }>> {
  const q = query(
    collection(db, ENTRIES),
    where('organization_id', '==', organizationId),
    where('version', '==', version)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ rfc: String(d.data().rfc || '') }));
}

export const defaultFiscalRiskPersistence: FiscalRiskListPersistence = {
  upsertEntriesChunk: writeFiscalRiskEntriesChunkToFirestore,
  writeMeta: writeFiscalRiskMetaToFirestore,
  readMeta: readFiscalRiskMetaFromFirestore,
  queryEntriesByVersion: queryFiscalRiskEntriesByVersion,
};

/**
 * Upsert versionado: escribe RFCs con nueva `version` en chunks,
 * luego actualiza meta.current_version (sin deletes masivos).
 */
export async function upsertFiscalRiskListVersioned(params: {
  organizationId: string;
  userId: string;
  fileName: string;
  entries: ReadonlyArray<FiscalRiskEntry>;
  publishedAtLabel?: string;
  listaTipo?: FiscalRiskListaTipo;
  persistence?: FiscalRiskListPersistence;
  versionId?: string;
}): Promise<{ version: string; rfcCount: number }> {
  const persistence = params.persistence ?? defaultFiscalRiskPersistence;
  const version = params.versionId ?? createListVersionId();
  const listaTipo = params.listaTipo ?? FISCAL_RISK_LISTA_TIPO_69B;
  const unique = buildFiscalRiskRfcSet(params.entries);
  const rfcs = [...unique];

  for (let i = 0; i < rfcs.length; i += FISCAL_RISK_BATCH_CHUNK) {
    const chunk = rfcs.slice(i, i + FISCAL_RISK_BATCH_CHUNK);
    const docs = chunk.map((rfc) => {
      const entry = params.entries.find((e) => normalizeRfc(e.rfc) === rfc);
      return {
        id: entryDocId(params.organizationId, rfc),
        data: {
          organization_id: params.organizationId,
          rfc,
          version,
          lista_tipo: listaTipo,
          cargado_por: params.userId,
          source_file_name: params.fileName,
          ...(entry?.nombreRazonSocial
            ? { nombre_razon_social: entry.nombreRazonSocial }
            : {}),
          ...(entry?.situacion ? { situacion: entry.situacion } : {}),
          ...(entry?.publicadoEn ? { publicado_en: entry.publicadoEn } : {}),
          actualizado_en: serverTimestamp(),
        },
      };
    });
    await persistence.upsertEntriesChunk(docs);
  }

  await persistence.writeMeta(params.organizationId, {
    organization_id: params.organizationId,
    current_version: version,
    rfc_count: rfcs.length,
    file_name: params.fileName,
    uploaded_by: params.userId,
    lista_tipo: listaTipo,
    ...(params.publishedAtLabel
      ? { published_at_label: params.publishedAtLabel }
      : {}),
    actualizado_en: serverTimestamp(),
  });

  await logAuditEntry(AUDIT_FISCAL_RISK_LIST_UPLOADED, 'fiscal_risk_list', {
    organization_id: params.organizationId,
    fileName: params.fileName,
    rfcCount: rfcs.length,
    replacedPrevious: true,
    version,
    ...(params.publishedAtLabel
      ? { publishedAt: params.publishedAtLabel }
      : {}),
  });

  return { version, rfcCount: rfcs.length };
}

export async function loadFiscalRiskIndex(
  organizationId: string,
  persistence: FiscalRiskListPersistence = defaultFiscalRiskPersistence
): Promise<FiscalRiskIndex | null> {
  const meta = await persistence.readMeta(organizationId);
  if (!meta) return null;
  const rows = await persistence.queryEntriesByVersion(
    organizationId,
    meta.current_version
  );
  const rfcs = new Set<string>();
  for (const r of rows) {
    const n = normalizeRfc(r.rfc);
    if (n) rfcs.add(n);
  }
  return {
    rfcs,
    version: meta.current_version,
    publishedAtLabel: meta.published_at_label,
    rfcCount: meta.rfc_count || rfcs.size,
  };
}

export type { FiscalRiskParseError };
