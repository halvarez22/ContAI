import { describe, expect, it } from 'vitest';
import {
  INVITE_TTL_MS,
  canAssignMemberRole,
  canInviteRole,
  isInvitableRole,
  normalizeInviteEmail,
} from './organizationInvite';

describe('organizationInvite', () => {
  it('normalizeInviteEmail hace trim + lower', () => {
    expect(normalizeInviteEmail('  Usuario@Empresa.COM ')).toBe(
      'usuario@empresa.com'
    );
  });

  it('TTL es 72 horas', () => {
    expect(INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('isInvitableRole rechaza owner', () => {
    expect(isInvitableRole('owner')).toBe(false);
    expect(isInvitableRole('admin')).toBe(true);
    expect(isInvitableRole('viewer')).toBe(true);
  });

  it('matriz canInviteRole', () => {
    expect(canInviteRole('owner', 'admin')).toBe(true);
    expect(canInviteRole('owner', 'viewer')).toBe(true);
    expect(canInviteRole('admin', 'contador')).toBe(true);
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('admin', 'owner')).toBe(false);
    expect(canInviteRole('contador', 'viewer')).toBe(false);
    expect(canInviteRole('viewer', 'viewer')).toBe(false);
  });

  it('canAssignMemberRole no permite owner ni auto-escalamiento admin', () => {
    expect(canAssignMemberRole('owner', 'admin')).toBe(true);
    expect(canAssignMemberRole('admin', 'admin')).toBe(false);
    expect(canAssignMemberRole('owner', 'owner')).toBe(false);
    expect(canAssignMemberRole('contador', 'viewer')).toBe(false);
  });
});
