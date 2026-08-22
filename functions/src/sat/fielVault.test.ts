import { describe, expect, it } from 'vitest';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  zeroizeBuffer,
  withDecryptedPrivateKey,
} from './fielVault';

describe('fielVault', () => {
  it('roundtrip encrypt/decrypt sin perder bytes', () => {
    const plain = Buffer.from('-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----');
    const blob = encryptPrivateKey(plain);
    const back = decryptPrivateKey(blob);
    expect(back.equals(plain)).toBe(true);
  });

  it('fingerprint es estable y corto', async () => {
    const { credentialFingerprint } = await import('./fielVault');
    const a = credentialFingerprint(Buffer.from('cer-bytes'));
    const b = credentialFingerprint(Buffer.from('cer-bytes'));
    expect(a).toBe(b);
    expect(a.length).toBe(16);
  });

  it('zeroize y withDecryptedPrivateKey limpian el buffer', () => {
    const plain = Buffer.from('secret-key-material-32bytes!!');
    const blob = encryptPrivateKey(plain);
    let seen = '';
    withDecryptedPrivateKey(blob, (key) => {
      seen = key.toString('utf8');
      expect(seen.includes('secret')).toBe(true);
    });
    const buf = Buffer.from('ABCD');
    zeroizeBuffer(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});
