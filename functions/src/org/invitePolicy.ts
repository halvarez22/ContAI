import type { OrgRole } from './membership';

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const INVITE_RATE_LIMIT_PER_ORG_HOUR = 10;
export const INVITE_MAX_RESENDS = 3;

export const INVITABLE_ROLES = ['admin', 'contador', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(value: unknown): value is InvitableRole {
  return (
    typeof value === 'string' &&
    (INVITABLE_ROLES as readonly string[]).includes(value)
  );
}

export function canInviteRole(
  inviterRole: OrgRole,
  targetRole: string
): targetRole is InvitableRole {
  if (!isInvitableRole(targetRole)) return false;
  if (inviterRole === 'owner') return true;
  if (inviterRole === 'admin') {
    return targetRole === 'contador' || targetRole === 'viewer';
  }
  return false;
}

export function canAssignMemberRole(
  actorRole: OrgRole,
  newRole: string
): boolean {
  if (newRole === 'owner') return false;
  if (!isInvitableRole(newRole) && newRole !== 'admin') return false;
  if (actorRole === 'owner') {
    return newRole === 'admin' || newRole === 'contador' || newRole === 'viewer';
  }
  if (actorRole === 'admin') {
    return newRole === 'contador' || newRole === 'viewer';
  }
  return false;
}

export function isInviteExpired(
  expiresAt: { toMillis?: () => number } | Date | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!expiresAt) return true;
  const ms =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt.toMillis === 'function'
        ? expiresAt.toMillis()
        : Number.NaN;
  if (!Number.isFinite(ms)) return true;
  return ms <= nowMs;
}
