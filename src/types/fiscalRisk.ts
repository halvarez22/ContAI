/**
 * Riesgo fiscal 69-B (E11.1) — contratos, normalización y copy legal.
 * Match solo por RFC exacto normalizado. Sin fuzzy / IA.
 */

/** Operaciones por writeBatch (margen Firestore = 500). */
export const FISCAL_RISK_BATCH_CHUNK = 400;

export const AUDIT_FISCAL_RISK_LIST_UPLOADED = 'FISCAL_RISK_LIST_UPLOADED';

export const FISCAL_RISK_LISTA_TIPO_69B = '69b' as const;
export type FiscalRiskListaTipo = typeof FISCAL_RISK_LISTA_TIPO_69B;

/** Copy centralizado — wording objetivo, no conclusivo (G3). */
export const FISCAL_RISK_COPY = {
  badgeLabel: 'Riesgo 69-B',
  kpiLabel: 'Proveedores con riesgo fiscal (69-B)',
  tooltip: (publishedAtLabel: string | undefined): string =>
    publishedAtLabel && publishedAtLabel.trim()
      ? `RFC presente en la lista 69-B del SAT (publicación: ${publishedAtLabel.trim()}).`
      : 'RFC presente en la lista 69-B del SAT (publicación: no indicada).',
  uploadHint:
    'La alerta requiere RFC de contraparte en la transacción (CFDI o captura manual).',
  confirmReplace:
    'Se publicará una nueva versión de la lista. Las alertas usarán solo esta versión.',
} as const;

export type FiscalRiskEntry = {
  rfc: string;
  nombreRazonSocial?: string;
  situacion?: string;
  publicadoEn?: string;
};

export type FiscalRiskParseError = {
  row: number;
  message: string;
};

export type FiscalRiskParseResult = {
  entries: FiscalRiskEntry[];
  errors: FiscalRiskParseError[];
  /** Fecha de publicación detectada en alguna fila (si existe). */
  publishedAtHint?: string;
};

export type FiscalRiskListMeta = {
  organization_id: string;
  current_version: string;
  rfc_count: number;
  file_name: string;
  uploaded_by: string;
  lista_tipo: FiscalRiskListaTipo;
  published_at_label?: string;
};

export type FiscalRiskIndex = {
  rfcs: ReadonlySet<string>;
  version: string;
  publishedAtLabel?: string;
  rfcCount: number;
};

/**
 * Normaliza RFC para match determinista: mayúsculas, sin espacios ni guiones.
 */
export function normalizeRfc(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-]/g, '');
}

/**
 * Normaliza clave de header CSV/Excel: minúsculas, sin acentos, sin espacios ni puntos.
 * Ej. " R.F.C. " → "rfc", "Situación" → "situacion"
 */
export function normalizeHeaderKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s.]/g, '');
}

export function isLikelyValidRfcShape(normalized: string): boolean {
  // Persona moral 12 / física 13 (SAT). No valida dígito verificador en MVP.
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(normalized);
}
