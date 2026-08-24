import { useState } from 'react';
import { Copy, UserPlus, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import type { OrgRole, OrganizationMember } from '../../types/organization';
import { canManageOrg } from '../../types/organization';
import type {
  InvitableRole,
  OrganizationInvitation,
} from '../../types/organizationInvite';
import { canInviteRole, INVITABLE_ROLES } from '../../types/organizationInvite';
import { useOrgMembers } from '../../hooks/useOrgMembers';

export type OrgMembersPanelProps = {
  organizationId: string;
  actorRole: OrgRole;
};

function roleOptionsFor(actor: OrgRole): InvitableRole[] {
  return INVITABLE_ROLES.filter((r) => canInviteRole(actor, r));
}

function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === 'owner') return ['admin', 'contador', 'viewer'];
  if (actor === 'admin') return ['contador', 'viewer'];
  return [];
}

export function OrgMembersPanel({
  organizationId,
  actorRole,
}: OrgMembersPanelProps) {
  const enabled = canManageOrg(actorRole);
  const {
    members,
    invites,
    loading,
    error,
    busy,
    lastInviteUrl,
    invite,
    resend,
    revokeInvite,
    changeRole,
    revokeMember,
  } = useOrgMembers({ organizationId, actorRole, enabled });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>(
    () => roleOptionsFor(actorRole)[0] ?? 'viewer'
  );
  const [copyOk, setCopyOk] = useState(false);

  if (!enabled) return null;

  const options = roleOptionsFor(actorRole);

  const onInvite = async () => {
    if (!email.trim()) return;
    await invite(email.trim(), role);
    setEmail('');
  };

  const copyLink = async () => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-brand" aria-hidden />
        <h4 className="text-base font-semibold text-ink">Equipo</h4>
      </div>
      <p className="text-xs text-ink-muted">
        Invita contadores o asistentes por email. El enlace expira en 72 horas.
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {lastInviteUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs text-ink-muted flex-1 min-w-0 truncate">
            Enlace de invitación listo (cópialo si el correo falló).
          </p>
          <Button
            type="button"
            variant="secondary"
            className="gap-1.5 text-xs"
            onClick={() => void copyLink()}
          >
            <Copy className="w-3.5 h-3.5" />
            {copyOk ? 'Copiado' : 'Copiar enlace'}
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-muted" htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contador@despacho.com"
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-ink"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-muted" htmlFor="invite-role">
            Rol
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as InvitableRole)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-ink"
          >
            {options.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          className="gap-1.5"
          disabled={busy || !email.trim()}
          onClick={() => void onInvite()}
        >
          <UserPlus className="w-4 h-4" />
          Invitar
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-ink-subtle">Cargando equipo…</p>
      ) : (
        <>
          <MemberTable
            members={members}
            actorRole={actorRole}
            busy={busy}
            onChangeRole={changeRole}
            onRevoke={revokeMember}
          />
          <InviteTable
            invites={invites}
            busy={busy}
            onResend={resend}
            onRevoke={revokeInvite}
          />
        </>
      )}
    </div>
  );
}

function MemberTable({
  members,
  actorRole,
  busy,
  onChangeRole,
  onRevoke,
}: {
  members: OrganizationMember[];
  actorRole: OrgRole;
  busy: boolean;
  onChangeRole: (memberId: string, role: OrgRole) => Promise<void>;
  onRevoke: (memberId: string) => Promise<void>;
}) {
  const roles = assignableRoles(actorRole);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
        Miembros
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {members.length === 0 ? (
          <li className="p-3 text-xs text-ink-subtle">Sin miembros</li>
        ) : (
          members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-2 p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink truncate">
                  {m.nombre || m.email || m.user_id}
                </p>
                {m.email ? (
                  <p className="text-xs text-ink-muted truncate">{m.email}</p>
                ) : null}
                {!m.activo ? (
                  <p className="text-xs text-danger">Inactivo</p>
                ) : null}
              </div>
              {m.role === 'owner' || !m.activo ? (
                <span className="text-xs font-mono text-ink-muted">{m.role}</span>
              ) : (
                <select
                  disabled={busy}
                  value={m.role}
                  onChange={(e) =>
                    void onChangeRole(m.id, e.target.value as OrgRole)
                  }
                  className="text-xs border border-border rounded-md px-2 py-1 bg-surface"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {!roles.includes(m.role) ? (
                    <option value={m.role}>{m.role}</option>
                  ) : null}
                </select>
              )}
              {m.role !== 'owner' && m.activo ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-danger"
                  disabled={busy}
                  onClick={() => void onRevoke(m.id)}
                >
                  Revocar
                </Button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function InviteTable({
  invites,
  busy,
  onResend,
  onRevoke,
}: {
  invites: OrganizationInvitation[];
  busy: boolean;
  onResend: (id: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
        Invitaciones pendientes
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {invites.length === 0 ? (
          <li className="p-3 text-xs text-ink-subtle">Ninguna pendiente</li>
        ) : (
          invites.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center gap-2 p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink truncate">
                  {inv.email_normalized}
                </p>
                <p className="text-xs text-ink-muted">
                  Rol {inv.role}
                  {inv.expires_at
                    ? ` · expira ${inv.expires_at.toLocaleString()}`
                    : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                disabled={busy}
                onClick={() => void onResend(inv.id)}
              >
                Reenviar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-xs text-danger"
                disabled={busy}
                onClick={() => void onRevoke(inv.id)}
              >
                Cancelar
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
