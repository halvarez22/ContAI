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
} from 'firebase/firestore';
import { db } from '../firebase';
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

function mapOrganization(id: string, data: Record<string, unknown>): Organization {
  const plan = data.plan === 'pro' ? 'pro' : 'free';
  const cuentas = Array.isArray(data.cuentas_contables)
    ? data.cuentas_contables.map((s) => String(s).trim()).filter(Boolean)
    : [];
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
    periodos_cerrados: periodos,
    creado_por: String(data.creado_por ?? ''),
  };
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
      cuentas_contables: cuentas,
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
    cuentas_contables: string[];
  }
): Promise<void> {
  await setDoc(
    doc(db, 'organizations', organizationId),
    {
      nombre: data.nombre.trim(),
      rfc: data.rfc.trim().toUpperCase(),
      cuentas_contables: data.cuentas_contables,
      actualizado_en: serverTimestamp(),
    },
    { merge: true }
  );
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
    cuentas_contables: [],
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
  for (let pass = 0; pass < 8; pass++) {
    const result = await backfillLegacyOrgMainDocs(input.userId, organizationId);
    if (result.done) {
      backfillDone = true;
      break;
    }
  }
  return { organizationId, backfillDone };
}
