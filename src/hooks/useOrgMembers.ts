import { useCallback, useEffect, useState } from 'react';
import type { OrgRole, OrganizationMember } from '../types/organization';
import type {
  InvitableRole,
  OrganizationInvitation,
} from '../types/organizationInvite';
import {
  createOrgInvite,
  listOrganizationMembers,
  listPendingInvitations,
  resendOrgInvite,
  revokeMemberAccess,
  revokeOrgInvite,
  updateMemberRole,
} from '../services/organizationInviteService';

export type UseOrgMembersArgs = {
  organizationId: string | null | undefined;
  actorRole: OrgRole | null | undefined;
  enabled: boolean;
};

export function useOrgMembers({
  organizationId,
  actorRole,
  enabled,
}: UseOrgMembersArgs) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invites, setInvites] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId || !enabled) {
      setMembers([]);
      setInvites([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [m, i] = await Promise.all([
        listOrganizationMembers(organizationId),
        listPendingInvitations(organizationId),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el equipo');
    } finally {
      setLoading(false);
    }
  }, [organizationId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invite = useCallback(
    async (email: string, role: InvitableRole) => {
      if (!organizationId) return;
      setBusy(true);
      setError(null);
      setLastInviteUrl(null);
      try {
        const result = await createOrgInvite({
          organizationId,
          email,
          role,
        });
        setLastInviteUrl(result.inviteUrl);
        if (!result.emailSent && result.emailError) {
          setError(
            `Invitación creada, pero el email falló: ${result.emailError}. Usa «Copiar enlace».`
          );
        }
        await refresh();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo invitar';
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [organizationId, refresh]
  );

  const resend = useCallback(
    async (inviteId: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await resendOrgInvite(inviteId);
        setLastInviteUrl(result.inviteUrl);
        if (!result.emailSent && result.emailError) {
          setError(
            `Reenviado localmente, email falló: ${result.emailError}. Usa «Copiar enlace».`
          );
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo reenviar');
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      setBusy(true);
      setError(null);
      try {
        await revokeOrgInvite(inviteId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cancelar');
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const changeRole = useCallback(
    async (memberId: string, newRole: OrgRole) => {
      if (!organizationId || !actorRole) return;
      setBusy(true);
      setError(null);
      try {
        await updateMemberRole({
          memberId,
          organizationId,
          actorRole,
          newRole,
        });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cambiar el rol');
      } finally {
        setBusy(false);
      }
    },
    [organizationId, actorRole, refresh]
  );

  const revokeMember = useCallback(
    async (memberId: string) => {
      setBusy(true);
      setError(null);
      try {
        await revokeMemberAccess(memberId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo revocar');
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  return {
    members,
    invites,
    loading,
    error,
    busy,
    lastInviteUrl,
    refresh,
    invite,
    resend,
    revokeInvite,
    changeRole,
    revokeMember,
    clearLastInviteUrl: () => setLastInviteUrl(null),
  };
}
