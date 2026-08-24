/** Membership helpers compartidos (SAT + invitaciones E8.2). */

import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const ORG_ROLES = ['owner', 'admin', 'contador', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export function memberDocId(userId: string, organizationId: string): string {
  return `${userId}_${organizationId}`;
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value);
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function assertOrgMember(
  uid: string,
  organizationId: string
): Promise<{ orgId: string; role: OrgRole }> {
  const orgId = String(organizationId || '').trim();
  if (!orgId) {
    throw new HttpsError('invalid-argument', 'organizationId requerido.');
  }
  const snap = await getFirestore()
    .collection('organization_members')
    .doc(memberDocId(uid, orgId))
    .get();
  if (!snap.exists || snap.data()?.activo === false) {
    throw new HttpsError(
      'permission-denied',
      'No eres miembro activo de esa organización.'
    );
  }
  const roleRaw = snap.data()?.role;
  const role: OrgRole = isOrgRole(roleRaw) ? roleRaw : 'viewer';
  return { orgId, role };
}

export async function assertCanManageOrg(
  uid: string,
  organizationId: string
): Promise<{ orgId: string; role: OrgRole }> {
  const result = await assertOrgMember(uid, organizationId);
  if (result.role !== 'owner' && result.role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Solo owner o admin pueden gestionar el equipo.'
    );
  }
  return result;
}
