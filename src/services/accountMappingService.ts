/**
 * Catálogo y mapeo (E15). Puro: sin Firebase ni Groq.
 * `classify` entra por parámetro.
 */

import {
  getChartOfAccountsSeed,
  PROVISIONAL_EGRESO_CODE,
  PROVISIONAL_INGRESO_CODE,
} from '../config/chartOfAccounts';
import type { AgentDecision } from '../types/agentDecision';
import {
  ACCOUNT_CODE_PATTERN,
  ACCOUNT_NATURALEZAS,
  IVA_TIPOS,
  type AccountAssignment,
  type AccountClassifyPayload,
  type AccountMappingMatch,
  type AccountMappingRule,
  type AccountSignals,
  type CatalogAccount,
  type CatalogIssue,
  type CatalogSyncResult,
  type CatalogOk,
  type IvaTipo,
} from '../types/chartOfAccounts';

export type ClassifyAccountFn = (
  payload: AccountClassifyPayload
) => Promise<AgentDecision | undefined>;

function issue(field: string, message: string): CatalogIssue {
  return { ok: false, field, message };
}

export function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function assertAccount(account: CatalogAccount): CatalogOk | CatalogIssue {
  const code = account.code.trim();
  if (!ACCOUNT_CODE_PATTERN.test(code) || code.length > 20) {
    return issue('code', 'El código debe ser numérico jerárquico, de 1 a 20 caracteres.');
  }
  const name = account.name.trim();
  if (name.length < 1 || name.length > 80) {
    return issue('name', 'El nombre debe tener entre 1 y 80 caracteres.');
  }
  if (!ACCOUNT_NATURALEZAS.includes(account.naturaleza)) {
    return issue('naturaleza', 'Naturaleza no válida.');
  }
  if (account.naturaleza === 'iva') {
    if (!account.tipo_iva || !IVA_TIPOS.includes(account.tipo_iva)) {
      return issue('tipo_iva', 'Una cuenta de IVA necesita tipo trasladado o acreditable.');
    }
  } else if (account.tipo_iva) {
    return issue('tipo_iva', 'Solo las cuentas de IVA llevan tipo de IVA.');
  }
  if (typeof account.activa !== 'boolean') {
    return issue('activa', 'Indica si la cuenta está activa.');
  }
  return { ok: true };
}

export function assertCatalog(
  accounts: readonly CatalogAccount[]
): CatalogOk | CatalogIssue {
  if (accounts.length > 200) {
    return issue('catalogo', 'El catálogo admite hasta 200 cuentas.');
  }
  const seen = new Set<string>();
  for (const account of accounts) {
    const check = assertAccount(account);
    if (!check.ok) return check;
    const code = account.code.trim();
    if (seen.has(code)) {
      return issue('code', `El código ${code} está repetido.`);
    }
    seen.add(code);
  }
  return { ok: true };
}

export function parseCatalogAccount(raw: unknown): CatalogAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.code !== 'string' || typeof row.name !== 'string') return null;
  if (typeof row.naturaleza !== 'string') return null;
  if (!ACCOUNT_NATURALEZAS.includes(row.naturaleza as CatalogAccount['naturaleza'])) {
    return null;
  }
  const tipo =
    row.tipo_iva === 'trasladado' || row.tipo_iva === 'acreditable'
      ? row.tipo_iva
      : undefined;
  const account: CatalogAccount = {
    code: row.code.trim(),
    name: row.name.trim(),
    naturaleza: row.naturaleza as CatalogAccount['naturaleza'],
    activa: row.activa !== false,
    ...(tipo ? { tipo_iva: tipo as IvaTipo } : {}),
    ...(typeof row.sat_name === 'string' && row.sat_name.trim()
      ? { sat_name: row.sat_name.trim() }
      : {}),
  };
  const check = assertAccount(account);
  return check.ok ? account : null;
}

export function parseCatalogList(raw: unknown): CatalogAccount[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogAccount[] = [];
  for (const item of raw) {
    const parsed = parseCatalogAccount(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s).trim()).filter(Boolean);
}

export function migrateLegacyNames(names: readonly string[]): {
  accounts: CatalogAccount[];
  pendientes: string[];
} {
  const seed = getChartOfAccountsSeed();
  const byName = new Map(seed.map((a) => [normalizeAccountName(a.name), a]));
  const accounts: CatalogAccount[] = [];
  const used = new Set<string>();
  const pendientes: string[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const hit = byName.get(normalizeAccountName(trimmed));
    if (hit && !used.has(hit.code)) {
      accounts.push({ ...hit });
      used.add(hit.code);
    } else if (!hit) {
      pendientes.push(trimmed);
    }
  }
  return { accounts, pendientes };
}

export function resolveEffectiveChart(org: {
  catalogo_cuentas?: unknown;
  catalogo_pendientes?: unknown;
  cuentas_contables?: unknown;
}): { accounts: CatalogAccount[]; pendientes: string[] } {
  const stored = parseCatalogList(org.catalogo_cuentas);
  if (stored.length > 0) {
    return {
      accounts: stored,
      pendientes: parseStringList(org.catalogo_pendientes),
    };
  }
  const legacy = parseStringList(org.cuentas_contables);
  if (legacy.length > 0) return migrateLegacyNames(legacy);
  return { accounts: getChartOfAccountsSeed(), pendientes: [] };
}

export function projectAccountNames(accounts: readonly CatalogAccount[]): string[] {
  return accounts.filter((a) => a.activa).map((a) => a.name);
}

/** Copia las cuentas de la semilla cuyo código no está en el catálogo. No muta la entrada. */
export function mergeMissingSeedAccounts(
  currentCatalog: readonly CatalogAccount[],
  seedCatalog: readonly CatalogAccount[] = getChartOfAccountsSeed()
): CatalogSyncResult {
  const present = new Set(currentCatalog.map((account) => account.code.trim()));
  const addedAccounts = seedCatalog
    .filter((seed) => !present.has(seed.code.trim()))
    .map((seed) => ({ ...seed }));
  return {
    addedCount: addedAccounts.length,
    addedAccounts,
    accounts: [...currentCatalog.map((account) => ({ ...account })), ...addedAccounts],
  };
}

function seedByCode(code: string): CatalogAccount | undefined {
  return getChartOfAccountsSeed().find((a) => a.code === code);
}

function provisional(tipo: AccountSignals['tipo']): AccountAssignment {
  const code = tipo === 'ingreso' ? PROVISIONAL_INGRESO_CODE : PROVISIONAL_EGRESO_CODE;
  const account = seedByCode(code);
  return {
    account_code: account?.code ?? code,
    account_name: account?.name ?? code,
    account_source: 'manual_fallback',
    confidence_score: 0,
    requires_human_approval: true,
    decision: 'approve_with_account',
    reason: 'Clasificación IA no disponible; cuenta provisional asignada.',
  };
}

function presentMatchKeys(match: AccountMappingMatch): (keyof AccountMappingMatch)[] {
  return (Object.keys(match) as (keyof AccountMappingMatch)[]).filter((key) => {
    const value = match[key];
    return typeof value === 'string' && value.trim() !== '';
  });
}

function signalValue(signals: AccountSignals, key: keyof AccountMappingMatch): string {
  if (key === 'tipo') return signals.tipo;
  if (key === 'cfdi_tipo') return String(signals.cfdi_tipo ?? '').toUpperCase();
  if (key === 'clave_prod_serv') return String(signals.clave_prod_serv ?? '').trim();
  if (key === 'metodo_pago_sat') return String(signals.metodo_pago_sat ?? '').toUpperCase();
  if (key === 'uso_cfdi') return String(signals.uso_cfdi ?? '').trim();
  return String(signals.rfc_contraparte ?? '').trim().toUpperCase();
}

function expectedValue(match: AccountMappingMatch, key: keyof AccountMappingMatch): string {
  const raw = String(match[key] ?? '').trim();
  if (key === 'cfdi_tipo' || key === 'metodo_pago_sat' || key === 'rfc_contraparte') {
    return raw.toUpperCase();
  }
  return raw;
}

function ruleMatches(match: AccountMappingMatch, signals: AccountSignals): boolean {
  const keys = presentMatchKeys(match);
  if (keys.length === 0) return false;
  return keys.every((key) => signalValue(signals, key) === expectedValue(match, key));
}

/** Mensaje para la pantalla. `null` si la regla puede guardarse. */
export function mappingRuleIssue(rule: AccountMappingRule): string | null {
  if (!rule.account_code.trim()) return 'La regla necesita una cuenta destino.';
  if (!Number.isFinite(rule.priority)) return 'La prioridad tiene que ser un número.';
  if (presentMatchKeys(rule.match).length === 0) {
    return 'La regla necesita al menos un filtro.';
  }
  const clave = rule.match.clave_prod_serv?.trim();
  if (clave && !/^\d{8}$/.test(clave)) {
    return 'La clave de producto debe tener 8 dígitos.';
  }
  const rfc = rule.match.rfc_contraparte?.trim() ?? '';
  if (rfc && !/^\S{12}$|^\S{13}$/.test(rfc)) {
    return 'El RFC de la contraparte debe tener 12 o 13 caracteres.';
  }
  const uso = rule.match.uso_cfdi?.trim() ?? '';
  if (uso && !/^[A-Za-z0-9]{2,4}$/.test(uso)) {
    return 'El uso de CFDI debe ser la clave del comprobante.';
  }
  if (rule.match.tipo && rule.match.tipo !== 'ingreso' && rule.match.tipo !== 'egreso') {
    return 'El tipo de movimiento debe ser ingreso o egreso.';
  }
  if (
    rule.match.cfdi_tipo &&
    rule.match.cfdi_tipo !== 'I' &&
    rule.match.cfdi_tipo !== 'E' &&
    rule.match.cfdi_tipo !== 'N' &&
    rule.match.cfdi_tipo !== 'P' &&
    rule.match.cfdi_tipo !== 'T'
  ) {
    return 'El tipo de CFDI no es válido.';
  }
  if (
    rule.match.metodo_pago_sat &&
    rule.match.metodo_pago_sat !== 'PUE' &&
    rule.match.metodo_pago_sat !== 'PPD'
  ) {
    return 'El método de pago debe ser PUE o PPD.';
  }
  return null;
}

export function matchAccountRule(
  rules: readonly AccountMappingRule[],
  signals: AccountSignals,
  chart: readonly CatalogAccount[]
): AccountMappingRule | null {
  const activeCodes = new Set(
    chart.filter((a) => a.activa).map((a) => a.code)
  );
  const sorted = rules
    .filter(
      (rule) =>
        rule.enabled &&
        activeCodes.has(rule.account_code) &&
        presentMatchKeys(rule.match).length > 0
    )
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const rule of sorted) {
    if (ruleMatches(rule.match, signals)) return rule;
  }
  return null;
}

function groqPayload(
  signals: AccountSignals,
  chart: readonly CatalogAccount[]
): AccountClassifyPayload {
  return {
    tipo: signals.tipo,
    monto: signals.monto,
    concepto: signals.concepto,
    proveedor: signals.proveedor,
    fecha: signals.fecha,
    moneda: signals.moneda,
    cfdi_tipo: signals.cfdi_tipo,
    clave_prod_serv: signals.clave_prod_serv,
    metodo_pago_sat: signals.metodo_pago_sat,
    uso_cfdi: signals.uso_cfdi,
    catalog: chart
      .filter((a) => a.activa)
      .map((a) => ({
        code: a.code,
        name: a.name,
        naturaleza: a.naturaleza,
      })),
  };
}

function fromChartCode(
  chart: readonly CatalogAccount[],
  code: string | undefined
): CatalogAccount | undefined {
  const trimmed = code?.trim();
  if (!trimmed) return undefined;
  return chart.find((a) => a.activa && a.code === trimmed);
}

export async function decideAccount(
  signals: AccountSignals,
  chart: readonly CatalogAccount[],
  rules: readonly AccountMappingRule[],
  classify: ClassifyAccountFn
): Promise<AccountAssignment> {
  const rule = matchAccountRule(rules, signals, chart);
  if (rule) {
    const account = chart.find((a) => a.code === rule.account_code && a.activa);
    if (account) {
      return {
        account_code: account.code,
        account_name: account.name,
        account_source: 'rule',
        confidence_score: 1,
        requires_human_approval: false,
        rule_id: rule.id,
        decision: 'mapped_by_rule',
        reason: 'Regla de catálogo',
      };
    }
  }

  try {
    const decision = await classify(groqPayload(signals, chart));
    const account = fromChartCode(chart, decision?.account_code);
    if (decision && account) {
      return {
        account_code: account.code,
        account_name: account.name,
        account_source: 'ai',
        confidence_score: decision.confidence_score,
        requires_human_approval: decision.requires_human_approval,
        decision: decision.decision,
        reason: decision.reason,
      };
    }
  } catch {
    return provisional(signals.tipo);
  }
  return provisional(signals.tipo);
}

export function manualAccountFields(
  chart: readonly CatalogAccount[],
  code: string
): { account_code: string; account_name: string } | null {
  const account = chart.find((a) => a.activa && a.code === code.trim());
  if (!account) return null;
  return { account_code: account.code, account_name: account.name };
}

export function toFirestoreAccount(account: CatalogAccount): Record<string, unknown> {
  const out: Record<string, unknown> = {
    code: account.code.trim(),
    name: account.name.trim(),
    naturaleza: account.naturaleza,
    activa: account.activa,
  };
  if (account.tipo_iva) out.tipo_iva = account.tipo_iva;
  if (account.sat_name) out.sat_name = account.sat_name;
  return out;
}
