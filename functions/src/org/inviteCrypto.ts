import { createHash, randomBytes } from 'crypto';

/** ≥128 bits de entropía; base64url. */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
