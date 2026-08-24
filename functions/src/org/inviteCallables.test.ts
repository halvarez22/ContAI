import { describe, expect, it } from 'vitest';
import { generateInviteToken, hashInviteToken } from './inviteCrypto';
import {
  INVITE_TTL_MS,
  canAssignMemberRole,
  canInviteRole,
  isInviteExpired,
  isInvitableRole,
} from './invitePolicy';
import { normalizeInviteEmail } from './membership';

describe('inviteCrypto', () => {
  it('genera token con entropía suficiente y hash estable', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashInviteToken(a)).toHaveLength(64);
    expect(hashInviteToken(a)).toBe(hashInviteToken(a));
    expect(hashInviteToken(a)).not.toBe(hashInviteToken(b));
  });
});

describe('invitePolicy', () => {
  it('TTL 72h y matriz de roles', () => {
    expect(INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000);
    expect(isInvitableRole('owner')).toBe(false);
    expect(canInviteRole('owner', 'admin')).toBe(true);
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('admin', 'viewer')).toBe(true);
    expect(canInviteRole('contador', 'viewer')).toBe(false);
    expect(canAssignMemberRole('admin', 'admin')).toBe(false);
    expect(canAssignMemberRole('owner', 'owner')).toBe(false);
  });

  it('isInviteExpired', () => {
    const now = Date.now();
    expect(isInviteExpired(new Date(now - 1000), now)).toBe(true);
    expect(isInviteExpired(new Date(now + 60_000), now)).toBe(false);
    expect(isInviteExpired(null, now)).toBe(true);
  });

  it('normalizeInviteEmail en accept path', () => {
    expect(normalizeInviteEmail('Usuario@Empresa.com')).toBe(
      'usuario@empresa.com'
    );
  });
});
