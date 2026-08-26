/**
 * Orquestación propose pagos + audit (E9.2 F5).
 * Groq vía proposePaymentApplications; sin side-effects en groqAIService.
 */

import { logAuditEntry } from './auditService';
import { proposePaymentApplications } from './groqAIService';
import {
  AUDIT_AI_PAYMENT_APPLICATION_FAILED,
  AUDIT_AI_PAYMENT_APPLICATION_PROPOSED,
  type PaymentAiProposal,
  type PaymentAiRawContext,
  type ProposePaymentApplicationsFn,
} from '../types/paymentApplication';

const AUDIT_CONTEXT_MAX = 500;

export type SuggestPaymentApplicationsResult =
  | {
      status: 'proposed';
      proposal: PaymentAiProposal;
      modelUsed: string;
      tokensUsed?: number;
    }
  | { status: 'failed'; error: string };

export function truncateAuditContext(summary: unknown): string {
  const raw = JSON.stringify(summary);
  if (raw.length <= AUDIT_CONTEXT_MAX) return raw;
  return raw.slice(0, AUDIT_CONTEXT_MAX);
}

export async function suggestPaymentApplications(params: {
  organizationId: string;
  sourceId: string;
  context: PaymentAiRawContext;
  propose?: ProposePaymentApplicationsFn;
}): Promise<SuggestPaymentApplicationsResult> {
  const propose = params.propose ?? proposePaymentApplications;

  try {
    const { proposal, modelUsed, tokensUsed } = await propose(params.context);

    const contextSummary = truncateAuditContext({
      sourceAmount: params.context.sourceAmount,
      sourceType: params.context.sourceType,
      candidatesCount: params.context.candidates.length,
      proposedLegs: proposal.applications.length,
      aliases: params.context.candidates.map((_, i) => `Factura_${i + 1}`),
    });

    await logAuditEntry(
      AUDIT_AI_PAYMENT_APPLICATION_PROPOSED,
      'ai_service',
      {
        organization_id: params.organizationId,
        sourceId: params.sourceId,
        confidence_score: proposal.confidence_score,
        requires_human_approval: proposal.requires_human_approval,
        contextSummary,
      },
      { provider: 'groq', modelUsed, tokensUsed }
    );

    return { status: 'proposed', proposal, modelUsed, tokensUsed };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 200) : 'Error desconocido en IA';
    console.warn('[paymentAi] propose failed:', message);

    await logAuditEntry(
      AUDIT_AI_PAYMENT_APPLICATION_FAILED,
      'ai_service',
      {
        organization_id: params.organizationId,
        sourceId: params.sourceId,
        errorClass: message.toLowerCase().includes('json')
          ? 'invalid_json'
          : 'network',
        message,
      },
      { provider: 'groq' }
    );

    return {
      status: 'failed',
      error:
        'No se pudo obtener sugerencia de IA. Puedes continuar con la aplicación manual.',
    };
  }
}
