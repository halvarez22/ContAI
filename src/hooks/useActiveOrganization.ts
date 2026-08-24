import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ACTIVE_ORG_STORAGE_KEY,
  type Organization,
  type OrganizationSummary,
} from '../types/organization';
import {
  bootstrapUserOrganizations,
  createOrganizationForUser,
  listOrganizationSummaries,
  setActiveOrganizationId,
} from '../services/organizationService';

function readStoredActiveOrg(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredActiveOrg(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function resolveCandidate(
  list: OrganizationSummary[],
  preferredFromUser: string | null
): string | null {
  const stored = readStoredActiveOrg();
  if (preferredFromUser && list.some((s) => s.organization.id === preferredFromUser)) {
    return preferredFromUser;
  }
  if (stored && list.some((s) => s.organization.id === stored)) {
    return stored;
  }
  return list[0]?.organization.id ?? null;
}

export type UseActiveOrganizationArgs = {
  userId: string | undefined;
  email: string | null | undefined;
  displayName: string | null | undefined;
};

export function useActiveOrganization({
  userId,
  email,
  displayName,
}: UseActiveOrganizationArgs) {
  const [summaries, setSummaries] = useState<OrganizationSummary[]>([]);
  const [activeOrganizationId, setActiveId] = useState<string | null>(null);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferredFromUser, setPreferredFromUser] = useState<string | null>(null);
  const bootstrappedForUser = useRef<string | null>(null);

  const refreshSummaries = useCallback(async (uid: string) => {
    const list = await listOrganizationSummaries(uid);
    setSummaries(list);
    return list;
  }, []);

  useEffect(() => {
    if (!userId) {
      setPreferredFromUser(null);
      return;
    }
    return onSnapshot(doc(db, 'users', userId), (snap) => {
      const id = snap.data()?.active_organization_id;
      setPreferredFromUser(typeof id === 'string' && id ? id : null);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setSummaries([]);
      setActiveId(null);
      setActiveOrg(null);
      setLoading(false);
      bootstrappedForUser.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (bootstrappedForUser.current !== userId) {
          setBootstrapping(true);
          let done = false;
          for (let i = 0; i < 12 && !done; i++) {
            const r = await bootstrapUserOrganizations({
              userId,
              email: email ?? null,
              displayName: displayName ?? 'Usuario',
            });
            done = r.backfillDone;
          }
          bootstrappedForUser.current = userId;
          if (!cancelled) setBootstrapping(false);
        }
        if (cancelled) return;
        await refreshSummaries(userId);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error al cargar organizaciones');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, email, displayName, refreshSummaries]);

  // Resolver activa cuando cambian summaries o preferencia
  useEffect(() => {
    if (!userId || loading) return;
    const candidate = resolveCandidate(summaries, preferredFromUser);
    if (candidate !== activeOrganizationId) {
      setActiveId(candidate);
      if (candidate) writeStoredActiveOrg(candidate);
    }
  }, [userId, loading, summaries, preferredFromUser, activeOrganizationId]);

  useEffect(() => {
    if (!activeOrganizationId) {
      setActiveOrg(null);
      return;
    }
    return onSnapshot(doc(db, 'organizations', activeOrganizationId), (snap) => {
      if (!snap.exists()) {
        setActiveOrg(null);
        return;
      }
      const data = snap.data();
      setActiveOrg({
        id: snap.id,
        nombre: String(data.nombre ?? '').trim(),
        rfc: String(data.rfc ?? '').trim().toUpperCase(),
        activa: data.activa !== false,
        plan: data.plan === 'pro' ? 'pro' : 'free',
        cuentas_contables: Array.isArray(data.cuentas_contables)
          ? data.cuentas_contables.map((s: unknown) => String(s).trim()).filter(Boolean)
          : [],
        periodos_cerrados: Array.isArray(data.periodos_cerrados)
          ? data.periodos_cerrados.map((x: unknown) => String(x))
          : [],
        creado_por: String(data.creado_por ?? ''),
      });
    });
  }, [activeOrganizationId]);

  const setActiveOrganization = useCallback(
    async (organizationId: string) => {
      if (!userId) return;
      const allowed = summaries.some((s) => s.organization.id === organizationId);
      if (!allowed) {
        throw new Error('Organización no permitida.');
      }
      await setActiveOrganizationId(userId, organizationId);
      writeStoredActiveOrg(organizationId);
      setActiveId(organizationId);
    },
    [userId, summaries]
  );

  const createOrganization = useCallback(
    async (nombre: string, rfc: string) => {
      if (!userId) throw new Error('Sin usuario');
      const id = await createOrganizationForUser(userId, { nombre, rfc });
      await refreshSummaries(userId);
      writeStoredActiveOrg(id);
      setActiveId(id);
      return id;
    },
    [userId, refreshSummaries]
  );

  /** Tras acceptOrgInvite: refresca memberships y fija org activa. */
  const adoptOrganization = useCallback(
    async (organizationId: string) => {
      if (!userId) throw new Error('Sin usuario');
      const list = await refreshSummaries(userId);
      if (!list.some((s) => s.organization.id === organizationId)) {
        throw new Error('Organización no disponible tras aceptar la invitación.');
      }
      await setActiveOrganizationId(userId, organizationId);
      writeStoredActiveOrg(organizationId);
      setActiveId(organizationId);
    },
    [userId, refreshSummaries]
  );

  const needsOrgPicker =
    !loading &&
    !bootstrapping &&
    summaries.length > 1 &&
    (!activeOrganizationId ||
      !summaries.some((s) => s.organization.id === activeOrganizationId));

  return {
    summaries,
    activeOrganizationId,
    activeOrg,
    loading,
    bootstrapping,
    error,
    needsOrgPicker,
    setActiveOrganization,
    createOrganization,
    adoptOrganization,
    refreshSummaries,
  } as const;
}
