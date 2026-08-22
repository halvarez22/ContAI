export interface AgentDecision {
  decision: string;
  confidence_score: number;
  reason: string;
  requires_human_approval: boolean;
  account_code?: string;
  account_name?: string;
  tax_deductible?: boolean;
  alert_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export const AGENT_TYPES = {
  CONCILIADOR: 'conciliador',
  CLASIFICADOR: 'clasificador',
  AUDITOR: 'auditor',
} as const;

export type AgentType = (typeof AGENT_TYPES)[keyof typeof AGENT_TYPES];
