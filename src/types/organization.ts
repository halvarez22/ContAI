/** Contratos multi-empresa E8.1. Sin any. */

export const LEGACY_ORG_MAIN = 'org_main';

export const ORG_ROLES = ['owner', 'admin', 'contador', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type Organization = {
  id: string;
  nombre: string;
  rfc: string;
  activa: boolean;
  plan: 'free' | 'pro';
  cuentas_contables: string[];
  periodos_cerrados: string[];
  creado_por: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  activo: boolean;
  /** Snapshot al aceptar invitación / bootstrap (E8.2). */
  email?: string;
  nombre?: string;
};

export type OrganizationSummary = {
  organization: Organization;
  membership: OrganizationMember;
};

/** ID predecible para Rules: get(.../organization_members/$(uid + '_' + orgId)) */
export function memberDocId(userId: string, organizationId: string): string {
  return `${userId}_${organizationId}`;
}

export function personalOrgIdForUser(userId: string): string {
  return `personal_${userId}`;
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value);
}

export function canWriteOrg(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'contador';
}

export function canManageOrg(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin';
}

export const ACTIVE_ORG_STORAGE_KEY = 'contai.activeOrganizationId';
export const BACKFILL_CHUNK_SIZE = 400;
