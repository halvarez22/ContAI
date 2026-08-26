/**
 * Aplicación de pagos SAT (E9.2) — contratos e invariantes (montos a 2 decimales).
 */

import { BANK_MATCH_AMOUNT_TOLERANCE_PCT } from './bankReconciliation';

/** Misma semántica que taxCalculatorService.roundMoney — local para no acoplar types→services. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export const PAYMENT_APP_MAX_TARGETS = 8;

/** Acciones audit_logs (snake_case MAYÚSCULAS). */
export const AUDIT_PAYMENT_APPLICATION_CONFIRMED = 'PAYMENT_APPLICATION_CONFIRMED';
export const AUDIT_AI_PAYMENT_APPLICATION_PROPOSED = 'AI_PAYMENT_APPLICATION_PROPOSED';
export const AUDIT_AI_PAYMENT_APPLICATION_FAILED = 'AI_PAYMENT_APPLICATION_FAILED';

export type PaymentApplicationSourceType =
  | 'cfdi_pago'
  | 'bank_movement'
  | 'manual';

export type PaymentStatus = 'none' | 'partial' | 'full';

export type PaymentApplicationDraft = {
  targetTransactionId: string;
  amount: number;
};

/** Input crudo (antes de sanitizar) para propose IA F5. */
export type PaymentAiCandidateRaw = {
  transactionId: string;
  fecha: string;
  saldoPendiente: number;
  concepto?: string;
};

export type PaymentAiRawContext = {
  sourceAmount: number;
  sourceType: PaymentApplicationSourceType;
  sourceFecha?: string;
  candidates: PaymentAiCandidateRaw[];
};

export type PaymentAiSanitizedCandidate = {
  alias: string;
  fecha: string;
  saldoPendiente: number;
  concepto: string;
};

export type PaymentAiSanitizedPayload = {
  source: { amount: number; tipo: string; fecha?: string };
  candidates: PaymentAiSanitizedCandidate[];
  /** Solo local — no se envía a Groq */
  aliasToTransactionId: Record<string, string>;
};

export type PaymentAiProposal = {
  applications: PaymentApplicationDraft[];
  confidence_score: number;
  reason: string;
  requires_human_approval: boolean;
};

export type ProposePaymentApplicationsFn = (
  input: PaymentAiRawContext
) => Promise<{
  proposal: PaymentAiProposal;
  modelUsed: string;
  tokensUsed?: number;
}>;

export type PaymentApplicationDoc = {
  organization_id: string;
  usuario_id: string;
  source_type: PaymentApplicationSourceType;
  source_id: string;
  target_transaction_id: string;
  amount: number;
  cfdi_uuid_relacionado?: string;
};

export function moneyEq(a: number, b: number, eps = 0.005): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= eps;
}

export function moneyWithinPct(
  actual: number,
  expected: number,
  pct: number = BANK_MATCH_AMOUNT_TOLERANCE_PCT
): boolean {
  const e = roundMoney(expected);
  const a = roundMoney(actual);
  if (e === 0) return a === 0;
  const diffPct = (Math.abs(a - e) / Math.abs(e)) * 100;
  return diffPct <= pct;
}

export function sumPaymentAmounts(
  applications: ReadonlyArray<PaymentApplicationDraft>
): number {
  let sum = 0;
  for (const a of applications) {
    sum = roundMoney(sum + roundMoney(a.amount));
  }
  return sum;
}

/** Defensa en profundidad: nunca saldo negativo por redondeo acumulado. */
export function computeSaldoPendiente(
  montoOriginal: number,
  appliedPaymentAmount: number
): number {
  return Math.max(
    0,
    roundMoney(roundMoney(montoOriginal) - roundMoney(appliedPaymentAmount))
  );
}

export function derivePaymentStatus(
  montoOriginal: number,
  appliedPaymentAmount: number
): PaymentStatus {
  const m = roundMoney(montoOriginal);
  const a = roundMoney(appliedPaymentAmount);
  if (a <= 0) return 'none';
  if (moneyWithinPct(a, m) || a >= m) return 'full';
  return 'partial';
}

export function assertValidPaymentApplications(params: {
  sourceAmount: number;
  applications: ReadonlyArray<PaymentApplicationDraft>;
  tolerancePct?: number;
}): { ok: true; sum: number } | { ok: false; error: string } {
  const applications = params.applications.map((a) => ({
    targetTransactionId: a.targetTransactionId,
    amount: roundMoney(a.amount),
  }));
  if (applications.length === 0) {
    return { ok: false, error: 'Sin aplicaciones de pago' };
  }
  if (applications.length > PAYMENT_APP_MAX_TARGETS) {
    return {
      ok: false,
      error: `Máximo ${PAYMENT_APP_MAX_TARGETS} facturas por pago`,
    };
  }
  for (const a of applications) {
    if (!(a.amount > 0)) {
      return {
        ok: false,
        error: `Monto inválido en factura ${a.targetTransactionId}`,
      };
    }
  }
  const ids = new Set<string>();
  for (const a of applications) {
    if (ids.has(a.targetTransactionId)) {
      return {
        ok: false,
        error: `Factura duplicada: ${a.targetTransactionId}`,
      };
    }
    ids.add(a.targetTransactionId);
  }
  const sum = sumPaymentAmounts(applications);
  const source = roundMoney(params.sourceAmount);
  if (!moneyWithinPct(sum, source, params.tolerancePct)) {
    return {
      ok: false,
      error: `Σ aplicaciones ${sum} ≠ monto pago ${source} (±${params.tolerancePct ?? BANK_MATCH_AMOUNT_TOLERANCE_PCT}%)`,
    };
  }
  return { ok: true, sum };
}

export function assertApplicationWithinSaldo(params: {
  targetTransactionId: string;
  amount: number;
  saldoPendiente: number;
}): { ok: true } | { ok: false; error: string } {
  const amount = roundMoney(params.amount);
  const saldo = roundMoney(params.saldoPendiente);
  if (amount > saldo + 0.005) {
    return {
      ok: false,
      error: `Sobrepasa saldo TX ${params.targetTransactionId}: ${amount} > ${saldo}`,
    };
  }
  return { ok: true };
}
