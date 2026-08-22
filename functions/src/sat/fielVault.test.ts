import { describe, expect, it, beforeAll } from 'vitest';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  credentialFingerprint,
} from './fielVault';

beforeAll(() => {
  process.env.SAT_FIEL_ALLOW_TEST_KEY = '1';
  process.env.NODE_ENV = 'test';
});

describe('fielVault', () => {
  it('roundtrip encrypt/decrypt sin perder bytes', () => {
    const pem = Buffer.from(
      '-----BEGIN PRIVATE KEY-----\nMIITestSecretKeyMaterial\n-----END PRIVATE KEY-----',
      'utf8'
    );
    const blob = encryptPrivateKey(pem);
    expect(blob.ciphertextB64).toBeTruthy();
    expect(blob.ivB64).toBeTruthy();
    expect(blob.authTagB64).toBeTruthy();
    const out = decryptPrivateKey(blob);
    expect(out.equals(pem)).toBe(true);
  });

  it('fingerprint es estable y corto', () => {
    const a = credentialFingerprint(Buffer.from('cer-a'));
    const b = credentialFingerprint(Buffer.from('cer-a'));
    expect(a).toBe(b);
    expect(a.length).toBe(16);
  });
});
