import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { AuditLogEntry } from '../types/audit';

export type { AuditLogEntry };

export async function logAuditEntry(
  accion: string,
  recurso: string,
  detalles: object,
  extras?: Pick<AuditLogEntry, 'provider' | 'modelUsed' | 'tokensUsed'>
): Promise<void> {
  try {
    const user = auth.currentUser;
    const entry: AuditLogEntry = {
      usuario_id: user?.uid || 'system',
      accion,
      recurso,
      detalles: detalles as Record<string, unknown>,
      ip_origen: 'unknown',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      timestamp: serverTimestamp(),
      firma_hash: btoa(Math.random().toString()),
      ...(extras?.provider ? { provider: extras.provider } : {}),
      ...(extras?.modelUsed ? { modelUsed: extras.modelUsed } : {}),
      ...(extras?.tokensUsed !== undefined ? { tokensUsed: extras.tokensUsed } : {}),
    };

    await addDoc(collection(db, 'audit_logs'), entry);
  } catch (error) {
    console.error('Error logging audit entry:', error);
  }
}
