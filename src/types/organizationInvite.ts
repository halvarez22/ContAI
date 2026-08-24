/** Contratos invitaciones E8.2. Sin any. */

import { isOrgRole, type OrgRole } from './organization';

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const INVITE_RATE_LIMIT_PER_ORG_HOUR = 10;
export const INVITE_MAX_RESENDS = 3;

export const INVITE_STATUSES = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Roles que se pueden asignar vía invitación (nunca owner). */
export const INVITABLE_ROLES = ['admin', 'contador', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type OrganizationInvitation = {
  id: string;
  organization_id: string;
  email_normalized: string;
  role: InvitableRole;
  invited_by_uid: string;
  invited_by_nombre: string;
  org_nombre: string;
  org_rfc: string;
  status: InviteStatus;
  expires_at: Date | null;
  created_at: Date | null;
  last_email_error?: string | null;
  accept_url_hint?: string | null;
};

export type OrgInvitePreview = {
  organizationId: string;
  orgNombre: string;
  orgRfc: string;
  role: InvitableRole;
  invitedByNombre: string;
  expiresAt: string | null;
  emailNormalized: string;
};

export type CreateOrgInviteResult = {
  inviteId: string;
  expiresAt: string;
  inviteUrl: string;
  emailSent: boolean;
  emailError?: string;
};

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return (
    typeof value === 'string' &&
    (INVITABLE_ROLES as readonly string[]).includes(value)
  );
}

export function isInviteStatus(value: unknown): value is InviteStatus {
  return (
    typeof value === 'string' &&
    (INVITE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Matriz E8.2:
 * - owner → admin | contador | viewer
 * - admin → contador | viewer
 * - contador/viewer → nada
 */
export function canInviteRole(
  inviterRole: OrgRole,
  targetRole: OrgRole | InvitableRole
): boolean {
  if (!isInvitableRole(targetRole)) return false;
  if (inviterRole === 'owner') {
    return (
      targetRole === 'admin' ||
      targetRole === 'contador' ||
      targetRole === 'viewer'
    );
  }
  if (inviterRole === 'admin') {
    return targetRole === 'contador' || targetRole === 'viewer';
  }
  return false;
}

export function canAssignMemberRole(
  actorRole: OrgRole,
  newRole: OrgRole
): boolean {
  if (newRole === 'owner') return false;
  if (!isOrgRole(newRole)) return false;
  if (actorRole === 'owner') {
    return newRole === 'admin' || newRole === 'contador' || newRole === 'viewer';
  }
  if (actorRole === 'admin') {
    return newRole === 'contador' || newRole === 'viewer';
  }
  return false;
}
