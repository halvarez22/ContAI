/**
 * Organización + membership + migración lazy (E8.1).
 * Escrituras Firestore vía este módulo / firestoreService.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import { logAuditEntry } from './auditService';
import {
  migrateLegacyNames,
  parseCatalogList,
  projectAccountNames,
  toFirestoreAccount,
  assertCatalog,
  mappingRuleIssue,
} from './accountMappingService';
import type { AccountMappingRule, CatalogAccount } from '../types/chartOfAccounts';
import {
  BACKFILL_CHUNK_SIZE,
  LEGACY_ORG_MAIN,
  memberDocId,
  personalOrgIdForUser,
  type Organization,
  type OrganizationMember,
  type OrganizationSummary,
  type OrgRole,
  isOrgRole,
} from '../types/organization';

const BACKFILL_COLLECTIONS = [
  'transactions',
  'recurring_transactions',
  'products',
  'inventory_movements',
] as const;

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s).trim()).filter(Boolean);
}

export function organizationFromData(
  id: string,
  data: Record<string, unknown>
): Organization {
  const plan = data.plan === 'pro' ? 'pro' : 'free';
  const catalogo = parseCatalogList(data.catalogo_cuentas);
  const cuentas = stringList(data.cuentas_contables);
  const periodos = Array.isArray(data.periodos_cerrados)
    ? data.periodos_cerrados.map((s) => String(s))
    : [];
  return {
    id,
    nombre: String(data.nombre ?? '').trim(),
    rfc: String(data.rfc ?? '').trim().toUpperCase(),
    activa: data.activa !== false,
    plan,
    cuentas_contables: cuentas,
    catalogo_cuentas: catalogo,
    catalogo_pendientes: stringList(data.catalogo_pendientes),
    periodos_cerrados: periodos,
    creado_por: String(data.creado_por ?? ''),
  };
}

function mapOrganization(id: string, data: Record<string, unknown>): Organization {
  return organizationFromData(id, data);
}

function chartWrite(accounts: readonly CatalogAccount[], pendientes: readonly string[]) {
  return {
    catalogo_cuentas: accounts.map((a) => toFirestoreAccount(a)),
    catalogo_pendientes: [...pendientes],
    cuentas_contables: projectAccountNames(accounts),
  };
}

function initialChart(legacyNames: readonly string[]) {
  if (legacyNames.length === 0) {
    const accounts = getChartOfAccountsSeed();
    return chartWrite(accounts, []);
  }
  const migrated = migrateLegacyNames(legacyNames);
  return chartWrite(migrated.accounts, migrated.pendientes);
}

function mapMember(id: string, data: Record<string, unknown>): OrganizationMember {
  const roleRaw = data.role;
  const role: OrgRole = isOrgRole(roleRaw) ? roleRaw : 'viewer';
  return {
    id,
    organization_id: String(data.organization_id ?? ''),
    user_id: String(data.user_id ?? ''),
    role,
    activo: data.activo !== false,
    email: typeof data.email === 'string' ? data.email : undefined,
    nombre: typeof data.nombre === 'string' ? data.nombre : undefined,
  };
}

export async function listMembershipsForUser(userId: string): Promise<OrganizationMember[]> {
  const q = query(
    collection(db, 'organization_members'),
    where('user_id', '==', userId),
    where('activo', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapMember(d.id, d.data() as Record<string, unknown>));
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, 'organizations', orgId));
  if (!snap.exists()) return null;
  return mapOrganization(snap.id, snap.data() as Record<string, unknown>);
}

export async function listOrganizationSummaries(
  userId: string
): Promise<OrganizationSummary[]> {
  const members = await listMembershipsForUser(userId);
  const out: OrganizationSummary[] = [];
  for (const membership of members) {
    const organization = await getOrganization(membership.organization_id);
    if (organization && organization.activa) {
      out.push({ organization, membership });
    }
  }
  return out;
}

export type EnsurePersonalOrgInput = {
  userId: string;
  email: string | null;
  displayName: string;
  legacyEmpresaNombre?: string;
  legacyEmpresaRfc?: string;
  legacyCuentas?: string[];
  legacyPeriodosCerrados?: string[];
};

/**
 * Idempotente: si ya hay memberships activas, no crea nada.
 * Si no, crea organizations/personal_{uid} + member uid_orgId en transacción.
 */
export async function ensurePersonalOrg(
  input: EnsurePersonalOrgInput
): Promise<{ organizationId: string; created: boolean }> {
  const existing = await listMembershipsForUser(input.userId);
  if (existing.length > 0) {
    const preferred = existing[0].organization_id;
    return { organizationId: preferred, created: false };
  }

  const organizationId = personalOrgIdForUser(input.userId);
  const memberId = memberDocId(input.userId, organizationId);
  const orgRef = doc(db, 'organizations', organizationId);
  const memberRef = doc(db, 'organization_members', memberId);
  const userRef = doc(db, 'users', input.userId);

  const nombre =
    (input.legacyEmpresaNombre ?? '').trim() ||
    input.displayName.trim() ||
    'Mi empresa';
  const rfc = (input.legacyEmpresaRfc ?? '').trim().toUpperCase() || '';
  const cuentas = (input.legacyCuentas ?? []).map((s) => s.trim()).filter(Boolean);
  const periodos = input.legacyPeriodosCerrados ?? [];

  await runTransaction(db, async (tx) => {
    const memberSnap = await tx.get(memberRef);
    if (memberSnap.exists()) {
      return;
    }
    tx.set(orgRef, {
      nombre,
      rfc,
      activa: true,
      plan: 'free',
      ...initialChart(cuentas),
      periodos_cerrados: periodos,
      creado_por: input.userId,
      creado_en: serverTimestamp(),
      actualizado_en: serverTimestamp(),
    });
    tx.set(memberRef, {
      organization_id: organizationId,
      user_id: input.userId,
      role: 'owner',
      activo: true,
      creado_en: serverTimestamp(),
    });
    tx.set(
      userRef,
      {
        active_organization_id: organizationId,
        actualizado_en: serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { organizationId, created: true };
}

export async function setActiveOrganizationId(
  userId: string,
  organizationId: string
): Promise<void> {
  const memberId = memberDocId(userId, organizationId);
  const memberSnap = await getDoc(doc(db, 'organization_members', memberId));
  if (!memberSnap.exists() || memberSnap.data()?.activo === false) {
    throw new Error('No tienes membresía activa en esa organización.');
  }
  await setDoc(
    doc(db, 'users', userId),
    {
      active_organization_id: organizationId,
      actualizado_en: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateOrganizationSettings(
  organizationId: string,
  data: {
    nombre: string;
    rfc: string;
  }
): Promise<void> {
  await setDoc(
    doc(db, 'organizations', organizationId),
    {
      nombre: data.nombre.trim(),
      rfc: data.rfc.trim().toUpperCase(),
      actualizado_en: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateOrganizationChart(
  organizationId: string,
  accounts: readonly CatalogAccount[],
  pendientes: readonly string[]
): Promise<void> {
  const check = assertCatalog(accounts);
  if (!check.ok) {
    throw new Error(check.message);
  }
  await setDoc(
    doc(db, 'organizations', organizationId),
    {
      ...chartWrite(accounts, pendientes),
      actualizado_en: serverTimestamp(),
    },
    { merge: true }
  );
  await logAuditEntry('CATALOGO_CUENTAS_UPDATED', 'organizations', {
    organization_id: organizationId,
    cuentas: accounts.length,
    pendientes: pendientes.length,
  });
}

export async function toggleOrganizationPeriodClosed(
  organizationId: string,
  periodKey: string,
  currentlyClosed: boolean
): Promise<void> {
  const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
  if (!orgSnap.exists()) throw new Error('Organización no encontrada.');
  const raw = orgSnap.data()?.periodos_cerrados;
  const list = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
  const next = currentlyClosed
    ? list.filter((k) => k !== periodKey)
    : Array.from(new Set([...list, periodKey]));
  await setDoc(
    doc(db, 'organizations', organizationId),
    {
      periodos_cerrados: next,
      actualizado_en: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createOrganizationForUser(
  userId: string,
  data: { nombre: string; rfc: string }
): Promise<string> {
  const orgRef = doc(collection(db, 'organizations'));
  const organizationId = orgRef.id;
  const memberId = memberDocId(userId, organizationId);
  const batch = writeBatch(db);
  batch.set(orgRef, {
    nombre: data.nombre.trim() || 'Nueva empresa',
    rfc: data.rfc.trim().toUpperCase(),
    activa: true,
    plan: 'free',
    ...initialChart([]),
    periodos_cerrados: [],
    creado_por: userId,
    creado_en: serverTimestamp(),
    actualizado_en: serverTimestamp(),
  });
  batch.set(doc(db, 'organization_members', memberId), {
    organization_id: organizationId,
    user_id: userId,
    role: 'owner',
    activo: true,
    creado_en: serverTimestamp(),
  });
  batch.set(
    doc(db, 'users', userId),
    {
      active_organization_id: organizationId,
      actualizado_en: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  return organizationId;
}

/**
 * Reetiqueta docs legacy org_main → targetOrgId en chunks.
 * Reanudable: no marca org_migrated_at hasta vaciar todas las colecciones.
 */
export async function backfillLegacyOrgMainDocs(
  userId: string,
  targetOrganizationId: string
): Promise<{ migrated: number; done: boolean }> {
  let migrated = 0;
  let remaining = false;

  for (const colName of BACKFILL_COLLECTIONS) {
    const q = query(
      collection(db, colName),
      where('usuario_id', '==', userId),
      where('organization_id', '==', LEGACY_ORG_MAIN),
      limit(BACKFILL_CHUNK_SIZE)
    );
    const snap = await getDocs(q);
    if (snap.empty) continue;
    remaining = true;
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      batch.set(d.ref, { organization_id: targetOrganizationId }, { merge: true });
    }
    await batch.commit();
    migrated += snap.docs.length;
    if (snap.docs.length >= BACKFILL_CHUNK_SIZE) {
      // Más batches pendientes en esta u otras colecciones
      remaining = true;
    }
  }

  if (!remaining) {
    // Verificar una pasada más por si quedó residuo
    for (const colName of BACKFILL_COLLECTIONS) {
      const q = query(
        collection(db, colName),
        where('usuario_id', '==', userId),
        where('organization_id', '==', LEGACY_ORG_MAIN),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        remaining = true;
        break;
      }
    }
  }

  if (!remaining) {
    await setDoc(
      doc(db, 'users', userId),
      {
        org_migrated_at: serverTimestamp(),
        actualizado_en: serverTimestamp(),
      },
      { merge: true }
    );
    return { migrated, done: true };
  }

  return { migrated, done: false };
}

/**
 * Bootstrap completo post-login: ensure org + backfill hasta done o un pass.
 * Caller puede reintentar mientras done === false.
 */
export async function bootstrapUserOrganizations(
  input: EnsurePersonalOrgInput
): Promise<{ organizationId: string; backfillDone: boolean }> {
  const userSnap = await getDoc(doc(db, 'users', input.userId));
  const ud = userSnap.data() ?? {};
  const legacyCuentas = Array.isArray(ud.cuentas_contables)
    ? ud.cuentas_contables.map((s: unknown) => String(s).trim()).filter(Boolean)
    : input.legacyCuentas;
  const legacyPeriodos = Array.isArray(ud.periodos_cerrados)
    ? ud.periodos_cerrados.map((x: unknown) => String(x))
    : input.legacyPeriodosCerrados;

  const { organizationId } = await ensurePersonalOrg({
    ...input,
    legacyEmpresaNombre:
      input.legacyEmpresaNombre ?? String(ud.empresa_nombre ?? ''),
    legacyEmpresaRfc: input.legacyEmpresaRfc ?? String(ud.empresa_rfc ?? ''),
    legacyCuentas,
    legacyPeriodosCerrados: legacyPeriodos,
  });

  const alreadyMigrated = Boolean(ud.org_migrated_at);
  if (alreadyMigrated) {
    return { organizationId, backfillDone: true };
  }

  let backfillDone = false;
  try {
    for (let pass = 0; pass < 8; pass++) {
      const result = await backfillLegacyOrgMainDocs(input.userId, organizationId);
      if (result.done) {
        backfillDone = true;
        break;
      }
    }
  } catch (e) {
    // E8.3/piloto: sin membresía en org_main el backfill puede fallar por rules.
    // No bloqueamos el login ni la org personal — el usuario debe poder operar.
    console.warn(
      '[E8.1] Backfill org_main omitido (permisos o query). Org activa OK:',
      organizationId,
      e
    );
    try {
      await setDoc(
        doc(db, 'users', input.userId),
        {
          org_migrated_at: serverTimestamp(),
          org_backfill_skipped: true,
          actualizado_en: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      /* no bloquear */
    }
    backfillDone = true;
  }
  return { organizationId, backfillDone };
}

function mappingCollection(organizationId: string) {
  return collection(db, 'organizations', organizationId, 'mapeo_cuentas');
}

function ruleToFirestore(rule: AccountMappingRule): Record<string, unknown> {
  const match: Record<string, string> = {};
  for (const [key, value] of Object.entries(rule.match)) {
    if (typeof value === 'string' && value.trim()) match[key] = value.trim();
  }
  return {
    organization_id: rule.organization_id,
    priority: rule.priority,
    enabled: rule.enabled,
    account_code: rule.account_code,
    match,
  };
}

export function parseMappingRule(id: string, data: Record<string, unknown>): AccountMappingRule | null {
  if (typeof data.account_code !== 'string' || typeof data.organization_id !== 'string') {
    return null;
  }
  const matchRaw = data.match;
  const match: AccountMappingRule['match'] = {};
  if (matchRaw && typeof matchRaw === 'object') {
    const row = matchRaw as Record<string, unknown>;
    if (row.tipo === 'ingreso' || row.tipo === 'egreso') match.tipo = row.tipo;
    if (row.cfdi_tipo === 'I' || row.cfdi_tipo === 'E' || row.cfdi_tipo === 'N' || row.cfdi_tipo === 'P' || row.cfdi_tipo === 'T') {
      match.cfdi_tipo = row.cfdi_tipo;
    }
    if (row.metodo_pago_sat === 'PUE' || row.metodo_pago_sat === 'PPD') {
      match.metodo_pago_sat = row.metodo_pago_sat;
    }
    if (typeof row.clave_prod_serv === 'string') match.clave_prod_serv = row.clave_prod_serv;
    if (typeof row.uso_cfdi === 'string') match.uso_cfdi = row.uso_cfdi;
    if (typeof row.rfc_contraparte === 'string') match.rfc_contraparte = row.rfc_contraparte;
  }
  return {
    id,
    organization_id: data.organization_id,
    priority: typeof data.priority === 'number' ? data.priority : 100,
    enabled: data.enabled !== false,
    account_code: data.account_code,
    match,
  };
}

export async function listMappingRules(organizationId: string): Promise<AccountMappingRule[]> {
  const snap = await getDocs(mappingCollection(organizationId));
  const rules: AccountMappingRule[] = [];
  snap.forEach((item) => {
    const parsed = parseMappingRule(item.id, item.data() as Record<string, unknown>);
    if (parsed) rules.push(parsed);
  });
  return rules.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export async function saveMappingRule(rule: AccountMappingRule): Promise<void> {
  const issue = mappingRuleIssue(rule);
  if (issue) throw new Error(issue);
  const batch = writeBatch(db);
  batch.set(doc(mappingCollection(rule.organization_id), rule.id), ruleToFirestore(rule));
  await batch.commit();
  await logAuditEntry('MAPEO_CUENTA_SAVED', 'mapeo_cuentas', {
    organization_id: rule.organization_id,
    rule_id: rule.id,
    account_code: rule.account_code,
  });
}

export async function deleteMappingRule(
  organizationId: string,
  ruleId: string
): Promise<void> {
  await deleteDoc(doc(mappingCollection(organizationId), ruleId));
  await logAuditEntry('MAPEO_CUENTA_DELETED', 'mapeo_cuentas', {
    organization_id: organizationId,
    rule_id: ruleId,
  });
}
