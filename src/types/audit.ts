/**
 * Contrato de audit_logs — schema existente (compatibilidad hacia atrás).
 * Campos nuevos solo opcionales.
 */

export interface AuditLogEntry {
  usuario_id: string;
  accion: string;
  recurso: string;
  detalles: Record<string, unknown>;
  ip_origen: string;
  user_agent: string;
  timestamp: unknown;
  firma_hash: string;
  /** Opcionales Fase 1+ — no requeridos en documentos históricos */
  provider?: 'groq' | 'gemini';
  modelUsed?: string;
  tokensUsed?: number;
}
