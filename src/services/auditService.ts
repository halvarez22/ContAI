import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

export interface AuditLogEntry {
  usuario_id: string;
  accion: string;
  recurso: string;
  detalles: any;
  ip_origen: string;
  user_agent: string;
  timestamp: any;
  firma_hash: string;
}

export async function logAuditEntry(accion: string, recurso: string, detalles: any) {
  try {
    const user = auth.currentUser;
    const entry = {
      usuario_id: user?.uid || 'system',
      accion,
      recurso,
      detalles,
      ip_origen: 'unknown', // In a real app, this would be fetched from a service
      user_agent: navigator.userAgent,
      timestamp: serverTimestamp(),
      firma_hash: btoa(Math.random().toString()), // Simplified hash for MVP
    };

    await addDoc(collection(db, 'audit_logs'), entry);
  } catch (error) {
    console.error('Error logging audit entry:', error);
  }
}
