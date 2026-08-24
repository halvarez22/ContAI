import { describe, it, expect } from 'vitest';
import {
  memberDocId,
  personalOrgIdForUser,
  isOrgRole,
  canWriteOrg,
  canManageOrg,
  LEGACY_ORG_MAIN,
  BACKFILL_CHUNK_SIZE,
} from './organization';

describe('organization types', () => {
  it('memberDocId es predecible uid_orgId', () => {
    expect(memberDocId('u1', 'orgA')).toBe('u1_orgA');
  });

  it('personalOrgIdForUser es estable', () => {
    expect(personalOrgIdForUser('abc')).toBe('personal_abc');
  });

  it('isOrgRole y permisos', () => {
    expect(isOrgRole('owner')).toBe(true);
    expect(isOrgRole('hacker')).toBe(false);
    expect(canWriteOrg('owner')).toBe(true);
    expect(canWriteOrg('viewer')).toBe(false);
    expect(canManageOrg('admin')).toBe(true);
    expect(canManageOrg('contador')).toBe(false);
  });

  it('constantes de migración', () => {
    expect(LEGACY_ORG_MAIN).toBe('org_main');
    expect(BACKFILL_CHUNK_SIZE).toBe(400);
  });
});
