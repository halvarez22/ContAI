/**
 * Cifrado envelope AES-256-GCM para FIEL (E6.2).
 * Master key: SAT_FIEL_MASTER_KEY (32 bytes base64) desde Secret Manager en prod.
 * Deuda documentada: migrar wrap de DEK a Cloud KMS (E6.3).
 * NUNCA registrar (log) material de clave privada.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGO = 'aes-256-gcm';

export type EncryptedBlob = {
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  keyVersion: number;
};

function resolveMasterKey(): Buffer {
  const raw = process.env.SAT_FIEL_MASTER_KEY?.trim();
  if (!raw) {
    // Solo para tests locales — NUNCA usar en producción
    if (process.env.NODE_ENV === 'test' || process.env.SAT_FIEL_ALLOW_TEST_KEY === '1') {
      return createHash('sha256').update('contai-e62-test-master-key').digest();
    }
    throw new Error(
      'SAT_FIEL_MASTER_KEY no configurada. Define el secret (Secret Manager) o habilita KMS.'
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('SAT_FIEL_MASTER_KEY debe ser 32 bytes en base64.');
  }
  return buf;
}

/** Cifra PEM/DER de llave privada. No loguear `plaintext`. */
export function encryptPrivateKey(
  plaintext: Buffer,
  keyVersion = 1
): EncryptedBlob {
  const master = resolveMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, master, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertextB64: enc.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: authTag.toString('base64'),
    keyVersion,
  };
}

export function decryptPrivateKey(blob: EncryptedBlob): Buffer {
  const master = resolveMasterKey();
  const iv = Buffer.from(blob.ivB64, 'base64');
  const authTag = Buffer.from(blob.authTagB64, 'base64');
  const ciphertext = Buffer.from(blob.ciphertextB64, 'base64');
  const decipher = createDecipheriv(ALGO, master, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Hash no reversible para auditoría (no es fingerprint de cert). */
export function credentialFingerprint(cerDerOrPem: Buffer): string {
  return createHash('sha256').update(cerDerOrPem).digest('hex').slice(0, 16);
}

/** Sobrescribe bytes en memoria (higiene criptográfica post-uso). */
export function zeroizeBuffer(buf: Buffer): void {
  if (buf.length > 0) buf.fill(0);
}

/**
 * Decrypt → callback → zeroize del buffer de llave.
 * Preferir sobre decryptPrivateKey suelto en call sites de FIEL.
 */
export function withDecryptedPrivateKey<T>(
  blob: EncryptedBlob,
  fn: (plaintext: Buffer) => T
): T {
  const plaintext = decryptPrivateKey(blob);
  try {
    return fn(plaintext);
  } finally {
    zeroizeBuffer(plaintext);
  }
}
