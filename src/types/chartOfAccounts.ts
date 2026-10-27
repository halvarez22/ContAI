/**
 * Catálogo con código y naturaleza (E15).
 * Semilla oficial: Anexo 24 RMF 2026, dictamen 2026-10-27.
 */

export const ACCOUNT_NATURALEZAS = [
  'activo',
  'pasivo',
  'capital',
  'ingreso',
  'gasto',
  'iva',
] as const;

export type AccountNaturaleza = (typeof ACCOUNT_NATURALEZAS)[number];

export const IVA_TIPOS = ['trasladado', 'acreditable'] as const;
export type IvaTipo = (typeof IVA_TIPOS)[number];

export const ACCOUNT_CODE_PATTERN = /^[0-9]+(\.[0-9]+)*$/;

export type CatalogAccount = {
  code: string;
  name: string;
  naturaleza: AccountNaturaleza;
  tipo_iva?: IvaTipo;
  activa: boolean;
  /** Nombre de nivel 2 del Anexo 24. Vacío en cuentas creadas por la org. */
  sat_name?: string;
};

export type AccountMappingMatch = {
  tipo?: 'ingreso' | 'egreso';
  cfdi_tipo?: 'I' | 'E' | 'N' | 'P' | 'T';
  clave_prod_serv?: string;
  metodo_pago_sat?: 'PUE' | 'PPD';
  uso_cfdi?: string;
  rfc_contraparte?: string;
};

export type AccountMappingRule = {
  id: string;
  organization_id: string;
  priority: number;
  enabled: boolean;
  account_code: string;
  match: AccountMappingMatch;
};

export type AccountSource =
  | 'rule'
  | 'ai'
  | 'manual'
  | 'manual_fallback'
  | 'nomina_default';

export type AccountAssignment = {
  account_code: string;
  account_name: string;
  account_source: AccountSource;
  confidence_score: number;
  requires_human_approval: boolean;
  rule_id?: string;
  decision: string;
  reason: string;
};

export type AccountSignals = {
  tipo: 'ingreso' | 'egreso';
  cfdi_tipo?: string;
  clave_prod_serv?: string;
  metodo_pago_sat?: string;
  uso_cfdi?: string;
  rfc_contraparte?: string;
  monto?: number;
  concepto?: string;
  proveedor?: string;
  fecha?: string;
  moneda?: string;
};

/** Payload que sí puede viajar a Groq. Sin RFC. */
export type AccountClassifyPayload = {
  tipo: 'ingreso' | 'egreso';
  monto?: number;
  concepto?: string;
  proveedor?: string;
  fecha?: string;
  moneda?: string;
  cfdi_tipo?: string;
  clave_prod_serv?: string;
  metodo_pago_sat?: string;
  uso_cfdi?: string;
  catalog: Array<{ code: string; name: string; naturaleza: AccountNaturaleza }>;
};

export type CatalogIssue = {
  ok: false;
  field: string;
  message: string;
};

export type CatalogOk = { ok: true };
