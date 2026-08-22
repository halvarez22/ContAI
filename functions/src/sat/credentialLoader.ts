/**
 * Carga FIEL cifrada desde Firestore + vault (E6.2.1).
 * Nunca loguea PEM/DER/password.
 */

import { getFirestore } from 'firebase-admin/firestore';
import {
  decryptPrivateKey,
  type EncryptedBlob,
  zeroizeBuffer,
} from './fielVault';

export type LoadedFielMaterial = {
  /** Contenido binario como string latin1 (API Nodecfdi/Credentials). */
  certificateContents: string;
  privateKeyContents: string;
  passPhrase: string;
  fingerprint: string;
  /** Sobrescribe buffers sensibles en memoria. */
  dispose: () => void;
};

type CredDoc = {
  cer_b64?: string;
  key_encrypted?: EncryptedBlob;
  password_encrypted?: EncryptedBlob;
  fingerprint?: string;
};

export async function loadOrgFielMaterial(
  organizationId: string
): Promise<LoadedFielMaterial | null> {
  const snap = await getFirestore()
    .collection('sat_credentials')
    .doc(organizationId)
    .get();
  if (!snap.exists) return null;
  const data = snap.data() as CredDoc;
  if (!data.cer_b64 || !data.key_encrypted) return null;

  const cerBuf = Buffer.from(data.cer_b64, 'base64');
  const keyBuf = decryptPrivateKey(data.key_encrypted);
  let passBuf: Buffer | null = null;
  let passPhrase = '';
  if (data.password_encrypted) {
    passBuf = decryptPrivateKey(data.password_encrypted);
    passPhrase = passBuf.toString('utf8');
  }

  const certificateContents = cerBuf.toString('latin1');
  const privateKeyContents = keyBuf.toString('latin1');

  return {
    certificateContents,
    privateKeyContents,
    passPhrase,
    fingerprint: data.fingerprint || '',
    dispose: () => {
      zeroizeBuffer(cerBuf);
      zeroizeBuffer(keyBuf);
      if (passBuf) zeroizeBuffer(passBuf);
      passPhrase = '';
    },
  };
}
