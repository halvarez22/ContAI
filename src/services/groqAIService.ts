/**
 * Único punto de contacto con la API Groq (Fase 1).
 * Clasificación/agentes: JSON forzado. Insights: texto.
 * Sin fallback a Gemini ni reglas locales.
 */

import { AI_MODELS } from '../config/aiModels';
import type { AgentDecision } from '../types/agentDecision';
import { AGENT_TYPES } from '../types/agentDecision';
import type {
  BankAiMatchInput,
  BankAiMatchProposal,
} from '../types/bankReconciliation';
import {
  PAYMENT_APP_MAX_TARGETS,
  moneyWithinPct,
  roundMoney,
  type PaymentAiProposal,
  type PaymentAiRawContext,
  type PaymentAiSanitizedPayload,
  type PaymentApplicationDraft,
} from '../types/paymentApplication';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export type GroqJsonResult<T> = {
  data: T;
  modelUsed: string;
  tokensUsed?: number;
};

export type GroqTextResult = {
  text: string;
  modelUsed: string;
  tokensUsed?: number;
};

const systemInstructions = {
  conciliador: `Eres un agente autónomo de conciliación bancaria para una empresa en México.
Tu tarea: elegir a lo sumo UNA transacción del libro (candidates) que corresponda al movimiento bancario.
Reglas:
- Preferir coincidencia de monto (±2%) y fecha cercana (±5 días).
- Si ninguna candidata es razonable → matchedTransactionId = null.
- Pagos >$50,000 MXN → requires_human_approval = true.
- No inventes IDs: solo usa ids presentes en candidates.
Responde ÚNICAMENTE con JSON.`,

  clasificador: `Eres un agente autónomo de clasificación de gastos contables para una empresa.
Tu tarea es asignar la cuenta contable correcta a cada gasto.
Contexto: Empresa comercial o de servicios con operaciones nacionales.
Cuentas principales:
- Insumos y Mercancías
- Gastos Operativos (luz, renta, servicios)
- Viáticos y Viajes
- Nómina y Honorarios
- Marketing y Publicidad
Responde en formato JSON.`,

  auditor: `Eres un agente autónomo de auditoría y detección de anomalías.
Tu tarea es identificar patrones inusuales en gastos y transacciones.
Reglas de alerta:
- Gasto >20% vs promedio histórico del mismo concepto → ALERTA
- Proveedor nuevo con monto >$30,000 → ALERTA
- Factura sin coincidencia en inventario → BLOQUEO
- Múltiples facturas mismo día mismo proveedor >$100,000 → ALERTA
Responde en formato JSON.`,
} as const;

function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'GROQ_API_KEY no configurada. Configura la clave para usar clasificación e insights con IA.'
    );
  }
  return key;
}

/** Enmascara PII no esencial antes de enviar contexto de clasificación a Groq. */
export function sanitizeClassificationContext(
  context: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...context };

  const maskEmail = (s: string) =>
    s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
  const maskPhone = (s: string) =>
    s.replace(/(?:\+?52)?[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[tel]');
  const maskRfc = (s: string) =>
    s.replace(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, (m) => `***${m.slice(-3)}`);

  const scrub = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    return maskRfc(maskPhone(maskEmail(value)));
  };

  for (const key of Object.keys(out)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('email') ||
      lower.includes('correo') ||
      lower.includes('telefono') ||
      lower.includes('teléfono') ||
      lower === 'curp' ||
      lower.includes('domicilio') ||
      lower.includes('direccion') ||
      lower.includes('dirección')
    ) {
      out[key] = '[redacted]';
      continue;
    }
    if (lower.includes('rfc')) {
      const v = out[key];
      out[key] = typeof v === 'string' ? maskRfc(v) : '[redacted]';
      continue;
    }
    out[key] = scrub(out[key]);
  }

  return out;
}

/** Sanitiza descripciones de estado de cuenta antes de Groq (E5.2). */
export function sanitizeBankDescription(desc: string): string {
  let s = desc;
  // Refs / CLABE / cuentas largas primero (antes de regex de teléfono)
  s = s.replace(/\b\d{10,}\b/g, '[ref]');
  s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
  s = s.replace(/(?:\+?52)?[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[tel]');
  s = s.replace(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, (m) => `***${m.slice(-3)}`);
  // Nombres propios simples (2–4 tokens capitalizados)
  s = s.replace(
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}\b/g,
    '[nombre]'
  );
  return s.trim().slice(0, 200);
}

export function parseBankAiMatchJson(raw: string): BankAiMatchProposal {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Respuesta Groq no es JSON válido');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Respuesta JSON de conciliación incompleta');
  }

  const obj = parsed as Record<string, unknown>;
  const idRaw = obj.matchedTransactionId;
  let matchedTransactionId: string | null = null;
  if (idRaw === null || idRaw === undefined || idRaw === '') {
    matchedTransactionId = null;
  } else if (typeof idRaw === 'string') {
    matchedTransactionId = idRaw;
  } else {
    throw new Error('matchedTransactionId inválido');
  }

  if (
    typeof obj.confidence_score !== 'number' ||
    typeof obj.reason !== 'string' ||
    typeof obj.requires_human_approval !== 'boolean'
  ) {
    throw new Error('Respuesta JSON de conciliación incompleta');
  }

  const confidence_score = Math.max(0, Math.min(1, obj.confidence_score));

  return {
    matchedTransactionId,
    confidence_score,
    reason: obj.reason.slice(0, 500),
    requires_human_approval: obj.requires_human_approval,
  };
}

/**
 * Propone match bancario vía Groq (JSON forzado). Sin Gemini / sin fallback local.
 */
export async function proposeBankMatch(
  input: BankAiMatchInput
): Promise<{
  proposal: BankAiMatchProposal;
  modelUsed: string;
  tokensUsed?: number;
}> {
  const systemPrompt = `${systemInstructions.conciliador}

Responde ÚNICAMENTE con un objeto JSON con claves:
matchedTransactionId (string|null), confidence_score (number 0..1), reason (string), requires_human_approval (boolean).`;

  const payload = sanitizeClassificationContext({
    bankRow: {
      fecha: input.bankRow.fecha,
      monto: input.bankRow.monto,
      descripcion: sanitizeBankDescription(input.bankRow.descripcion),
    },
    candidates: input.candidates.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      monto: c.monto,
      concepto: sanitizeBankDescription(String(c.concepto || '')),
    })),
  });

  const result = await completeJson(
    systemPrompt,
    JSON.stringify(payload),
    parseBankAiMatchJson,
    0.1
  );

  // No inventar ids fuera de candidates
  const allowed = new Set(input.candidates.map((c) => c.id));
  let proposal = result.data;
  if (
    proposal.matchedTransactionId &&
    !allowed.has(proposal.matchedTransactionId)
  ) {
    proposal = {
      ...proposal,
      matchedTransactionId: null,
      reason: `${proposal.reason} (id fuera de candidatos; descartado)`,
      requires_human_approval: true,
    };
  }

  return {
    proposal,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
  };
}

const paymentAiSystem = `Eres un agente de aplicación de pagos CFDI (complemento P / pagos) para una empresa en México.
Tu tarea: repartir el monto del origen (source.amount) entre una o varias facturas candidatas (candidates).
Reglas:
- Usa SOLO los alias exactos de candidates (Factura_1, Factura_2, …). No inventes aliases.
- Máximo ${PAYMENT_APP_MAX_TARGETS} aplicaciones.
- Cada amount > 0; la suma de amounts debe ≈ source.amount (±2%).
- Respeta saldoPendiente de cada factura (no superar).
- Preferir saldar facturas más antiguas si hay empate.
- Si no hay asignación confiable → applications = [] y requires_human_approval = true.
Responde ÚNICAMENTE con JSON.`;

/**
 * Sanitiza contexto de aplicación de pagos: aliases Factura_N, sin RFC/nombres reales.
 * Función pura (F5 G1).
 */
export function sanitizePaymentApplicationContext(
  input: PaymentAiRawContext
): PaymentAiSanitizedPayload {
  const limited = input.candidates.slice(0, PAYMENT_APP_MAX_TARGETS);
  const aliasToTransactionId: Record<string, string> = {};
  const candidates = limited.map((c, i) => {
    const alias = `Factura_${i + 1}`;
    aliasToTransactionId[alias] = c.transactionId;
    return {
      alias,
      fecha: c.fecha,
      saldoPendiente: roundMoney(c.saldoPendiente),
      concepto: sanitizeBankDescription(String(c.concepto || 'Servicio')),
    };
  });

  const source: PaymentAiSanitizedPayload['source'] = {
    amount: roundMoney(input.sourceAmount),
    tipo: input.sourceType,
  };
  if (input.sourceFecha) {
    source.fecha = input.sourceFecha;
  }

  return { source, candidates, aliasToTransactionId };
}

/** Payload enviado a Groq (sin mapa de IDs reales). */
export function paymentAiPayloadForGroq(
  sanitized: PaymentAiSanitizedPayload
): Record<string, unknown> {
  return sanitizeClassificationContext({
    source: sanitized.source,
    candidates: sanitized.candidates,
  });
}

export type PaymentAiParsedRaw = {
  applications: Array<{ targetAlias: string; amount: number }>;
  confidence_score: number;
  reason: string;
  requires_human_approval: boolean;
};

export function parsePaymentApplicationsJson(raw: string): PaymentAiParsedRaw {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Respuesta Groq no es JSON válido');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Respuesta JSON de aplicación de pagos incompleta');
  }

  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.confidence_score !== 'number' ||
    typeof obj.reason !== 'string' ||
    typeof obj.requires_human_approval !== 'boolean' ||
    !Array.isArray(obj.applications)
  ) {
    throw new Error('Respuesta JSON de aplicación de pagos incompleta');
  }

  const applications: Array<{ targetAlias: string; amount: number }> = [];
  for (const item of obj.applications) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const alias =
      typeof row.targetAlias === 'string'
        ? row.targetAlias
        : typeof row.alias === 'string'
          ? row.alias
          : null;
    const amount =
      typeof row.amount === 'number' ? row.amount : Number(row.amount);
    if (!alias || !Number.isFinite(amount)) continue;
    applications.push({
      targetAlias: alias,
      amount: roundMoney(Math.max(0, amount)),
    });
  }

  return {
    applications,
    confidence_score: Math.max(0, Math.min(1, obj.confidence_score)),
    reason: obj.reason.slice(0, 500),
    requires_human_approval: obj.requires_human_approval,
  };
}

/**
 * Resuelve aliases → transactionId. Descarta aliases fantasma;
 * si hubo descarte o Σ inválida → requires_human_approval.
 */
export function resolvePaymentAiProposal(
  parsed: PaymentAiParsedRaw,
  aliasToTransactionId: Record<string, string>,
  sourceAmount: number
): PaymentAiProposal {
  const allowed = new Set(Object.keys(aliasToTransactionId));
  const applications: PaymentApplicationDraft[] = [];
  let discarded = false;

  for (const leg of parsed.applications) {
    if (!allowed.has(leg.targetAlias)) {
      discarded = true;
      continue;
    }
    if (!(leg.amount > 0)) {
      discarded = true;
      continue;
    }
    const txId = aliasToTransactionId[leg.targetAlias];
    if (!txId) {
      discarded = true;
      continue;
    }
    const existing = applications.find((a) => a.targetTransactionId === txId);
    if (existing) {
      existing.amount = roundMoney(existing.amount + leg.amount);
    } else {
      if (applications.length >= PAYMENT_APP_MAX_TARGETS) {
        discarded = true;
        continue;
      }
      applications.push({
        targetTransactionId: txId,
        amount: roundMoney(leg.amount),
      });
    }
  }

  let requires_human_approval =
    parsed.requires_human_approval || discarded || applications.length === 0;

  if (applications.length > 0) {
    const sum = applications.reduce((s, a) => roundMoney(s + a.amount), 0);
    if (!moneyWithinPct(sum, sourceAmount)) {
      requires_human_approval = true;
    }
  }

  let reason = parsed.reason;
  if (discarded) {
    reason = `${reason} (alias desconocido o leg inválido descartado)`.slice(
      0,
      500
    );
  }

  return {
    applications,
    confidence_score: parsed.confidence_score,
    reason,
    requires_human_approval,
  };
}

/**
 * Propone aplicaciones de pago vía Groq (JSON forzado). Sin Gemini / sin auto-confirm.
 */
export async function proposePaymentApplications(
  input: PaymentAiRawContext
): Promise<{
  proposal: PaymentAiProposal;
  modelUsed: string;
  tokensUsed?: number;
}> {
  const sanitized = sanitizePaymentApplicationContext(input);
  const payload = paymentAiPayloadForGroq(sanitized);

  const systemPrompt = `${paymentAiSystem}

Responde ÚNICAMENTE con un objeto JSON con claves:
applications (array de { targetAlias: string, amount: number }),
confidence_score (number 0..1), reason (string), requires_human_approval (boolean).`;

  const result = await completeJson(
    systemPrompt,
    JSON.stringify(payload),
    parsePaymentApplicationsJson,
    0.1
  );

  const proposal = resolvePaymentAiProposal(
    result.data,
    sanitized.aliasToTransactionId,
    sanitized.source.amount
  );

  return {
    proposal,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
  };
}

export function parseAgentJson(raw: string): AgentDecision {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Respuesta Groq no es JSON válido');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Respuesta JSON incompleta');
  }

  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.decision !== 'string' ||
    typeof obj.confidence_score !== 'number' ||
    typeof obj.reason !== 'string' ||
    typeof obj.requires_human_approval !== 'boolean'
  ) {
    throw new Error('Respuesta JSON incompleta');
  }

  const decision: AgentDecision = {
    decision: obj.decision,
    confidence_score: obj.confidence_score,
    reason: obj.reason,
    requires_human_approval: obj.requires_human_approval,
  };

  if (typeof obj.account_code === 'string') decision.account_code = obj.account_code;
  if (typeof obj.account_name === 'string') decision.account_name = obj.account_name;
  if (typeof obj.tax_deductible === 'boolean') decision.tax_deductible = obj.tax_deductible;
  if (typeof obj.alert_type === 'string') decision.alert_type = obj.alert_type;
  if (
    obj.severity === 'low' ||
    obj.severity === 'medium' ||
    obj.severity === 'high' ||
    obj.severity === 'critical'
  ) {
    decision.severity = obj.severity;
  }

  return decision;
}

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
  model?: string;
};

async function groqChat(params: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature: number;
  jsonObject: boolean;
  maxTokens?: number;
}): Promise<{ content: string; modelUsed: string; tokensUsed?: number }> {
  const key = getGroqApiKey();
  const modelUsed = AI_MODELS.groq;

  const body: Record<string, unknown> = {
    model: modelUsed,
    messages: params.messages,
    temperature: params.temperature,
  };
  if (params.jsonObject) {
    body.response_format = { type: 'json_object' };
  }
  if (params.maxTokens !== undefined) {
    body.max_tokens = params.maxTokens;
  }

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${errBody}`);
  }

  const data = (await res.json()) as GroqChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq: respuesta vacía');
  }

  return {
    content,
    modelUsed: data.model || modelUsed,
    tokensUsed: data.usage?.total_tokens,
  };
}

export async function completeJson<T>(
  systemPrompt: string,
  userContent: string,
  parse: (raw: string) => T,
  temperature = 0.2
): Promise<GroqJsonResult<T>> {
  const { content, modelUsed, tokensUsed } = await groqChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature,
    jsonObject: true,
  });

  return { data: parse(content), modelUsed, tokensUsed };
}

export async function completeText(
  systemPrompt: string,
  userContent: string,
  temperature = 0.35,
  maxTokens = 4096
): Promise<GroqTextResult> {
  const { content, modelUsed, tokensUsed } = await groqChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature,
    jsonObject: false,
    maxTokens,
  });

  return { text: content.trim(), modelUsed, tokensUsed };
}

export type ExecuteAgentResult = {
  decision: AgentDecision;
  modelUsed: string;
  tokensUsed?: number;
  provider: 'groq';
};

/**
 * Ejecuta un agente contable solo vía Groq (JSON).
 * Sin fallback a Gemini ni reglas locales.
 */
export async function executeAgent(
  agentType: string,
  context: object
): Promise<ExecuteAgentResult> {
  const instruction = systemInstructions[agentType as keyof typeof systemInstructions];
  if (!instruction) {
    throw new Error(`Tipo de agente desconocido: ${agentType}`);
  }

  const systemPrompt = `${instruction}

Responde ÚNICAMENTE con un objeto JSON (sin markdown) con estas claves obligatorias:
decision (string), confidence_score (number entre 0 y 1), reason (string), requires_human_approval (boolean).
Opcionales: account_code, account_name, tax_deductible, alert_type, severity ("low"|"medium"|"high"|"critical").`;

  const rawContext =
    context && typeof context === 'object'
      ? (context as Record<string, unknown>)
      : { value: context };
  const sanitized = sanitizeClassificationContext(rawContext);

  const result = await completeJson(systemPrompt, JSON.stringify(sanitized), parseAgentJson, 0.2);

  return {
    decision: result.data,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
    provider: 'groq',
  };
}

export { AGENT_TYPES };
