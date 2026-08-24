/**
 * Cliente de invitaciones E8.2 — solo callables + lecturas Firestore.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { OrgRole, OrganizationMember } from '../types/organization';
import { isOrgRole } from '../types/organization';
import type {
  CreateOrgInviteResult,
  InvitableRole,
  OrganizationInvitation,
  OrgInvitePreview,
} from '../types/organizationInvite';
import {
  canAssignMemberRole,
  isInviteStatus,
  isInvitableRole,
} from '../types/organizationInvite';

function tsToDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as Timestamp).toDate === 'function'
  ) {
    return (value as Timestamp).toDate();
  }
  return null;
}

export async function createOrgInvite(input: {
  organizationId: string;
  email: string;
  role: InvitableRole;
}): Promise<CreateOrgInviteResult> {
  const fn = httpsCallable<
    { organizationId: string; email: string; role: InvitableRole },
    CreateOrgInviteResult
  >(functions, 'createOrgInvite');
  const res = await fn(input);
  return res.data;
}

export async function resendOrgInvite(
  inviteId: string
): Promise<CreateOrgInviteResult> {
  const fn = httpsCallable<{ inviteId: string }, CreateOrgInviteResult>(
    functions,
    'resendOrgInvite'
  );
  const res = await fn({ inviteId });
  return res.data;
}

export async function revokeOrgInvite(inviteId: string): Promise<void> {
  const fn = httpsCallable<{ inviteId: string }, { ok: boolean }>(
    functions,
    'revokeOrgInvite'
  );
  await fn({ inviteId });
}

export async function previewOrgInvite(
  token: string
): Promise<OrgInvitePreview> {
  const fn = httpsCallable<{ token: string }, OrgInvitePreview>(
    functions,
    'previewOrgInvite'
  );
  const res = await fn({ token });
  return res.data;
}

export async function acceptOrgInvite(
  token: string
): Promise<{ organizationId: string; role: string }> {
  const fn = httpsCallable<
    { token: string },
    { organizationId: string; role: string }
  >(functions, 'acceptOrgInvite');
  const res = await fn({ token });
  return res.data;
}

export async function listOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const snap = await getDocs(
    query(
      collection(db, 'organization_members'),
      where('organization_id', '==', organizationId)
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const roleRaw = data.role;
    const role: OrgRole = isOrgRole(roleRaw) ? roleRaw : 'viewer';
    return {
      id: d.id,
      organization_id: String(data.organization_id ?? ''),
      user_id: String(data.user_id ?? ''),
      role,
      activo: data.activo !== false,
      email: typeof data.email === 'string' ? data.email : undefined,
      nombre: typeof data.nombre === 'string' ? data.nombre : undefined,
    };
  });
}

export async function listPendingInvitations(
  organizationId: string
): Promise<OrganizationInvitation[]> {
  const snap = await getDocs(
    query(
      collection(db, 'organization_invitations'),
      where('organization_id', '==', organizationId),
      where('status', '==', 'pending')
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const roleRaw = data.role;
    const statusRaw = data.status;
    return {
      id: d.id,
      organization_id: String(data.organization_id ?? ''),
      email_normalized: String(data.email_normalized ?? ''),
      role: isInvitableRole(roleRaw) ? roleRaw : 'viewer',
      invited_by_uid: String(data.invited_by_uid ?? ''),
      invited_by_nombre: String(data.invited_by_nombre ?? ''),
      org_nombre: String(data.org_nombre ?? ''),
      org_rfc: String(data.org_rfc ?? ''),
      status: isInviteStatus(statusRaw) ? statusRaw : 'pending',
      expires_at: tsToDate(data.expires_at),
      created_at: tsToDate(data.created_at),
      last_email_error:
        typeof data.last_email_error === 'string'
          ? data.last_email_error
          : null,
    };
  });
}

export async function updateMemberRole(input: {
  memberId: string;
  organizationId: string;
  actorRole: OrgRole;
  newRole: OrgRole;
}): Promise<void> {
  if (!canAssignMemberRole(input.actorRole, input.newRole)) {
    throw new Error('No puedes asignar ese rol.');
  }
  await updateDoc(doc(db, 'organization_members', input.memberId), {
    role: input.newRole,
  });
}

export async function revokeMemberAccess(memberId: string): Promise<void> {
  await updateDoc(doc(db, 'organization_members', memberId), {
    activo: false,
  });
}

export function readInviteTokenFromLocation(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''
): string | null {
  const params = new URLSearchParams(search);
  const fromQuery = params.get('token')?.trim();
  if (fromQuery) return fromQuery;
  if (pathname.replace(/\/$/, '').endsWith('/invite')) {
    return params.get('token')?.trim() || null;
  }
  return null;
}

export function clearInviteQueryFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  if (url.pathname.replace(/\/$/, '').endsWith('/invite')) {
    url.pathname = '/';
  }
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}
