import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

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
  AUDITOR: 'auditor'
} as const;

const systemInstructions = {
  conciliador: `Eres un agente autónomo de conciliación bancaria para una empresa.
Tu tarea es cruzar movimientos bancarios con registros contables internos.
Reglas:
- Si monto coincide ±2% y fecha ±3 días → CONFIDENCE: HIGH
- Si monto coincide pero fecha >5 días → CONFIDENCE: MEDIUM
- Si hay discrepancia >5% → CONFIDENCE: LOW, requiere revisión humana
- Pagos >$50,000 MXN siempre requieren aprobación humana
Responde en formato JSON.`,

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
Responde en formato JSON.`
} as const;

function parseAgentJson(raw: string): AgentDecision {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const parsed = JSON.parse(text) as AgentDecision;
  if (
    typeof parsed.decision !== 'string' ||
    typeof parsed.confidence_score !== 'number' ||
    typeof parsed.reason !== 'string' ||
    typeof parsed.requires_human_approval !== 'boolean'
  ) {
    throw new Error('Respuesta JSON incompleta');
  }
  return parsed;
}

async function executeWithGroq(agentType: string, context: object): Promise<AgentDecision> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY no configurada');

  const instruction = systemInstructions[agentType as keyof typeof systemInstructions];
  if (!instruction) throw new Error(`Tipo de agente desconocido: ${agentType}`);

  const systemPrompt = `${instruction}

Responde ÚNICAMENTE con un objeto JSON (sin markdown) con estas claves obligatorias:
decision (string), confidence_score (number entre 0 y 1), reason (string), requires_human_approval (boolean).
Opcionales: account_code, account_name, tax_deductible, alert_type, severity ("low"|"medium"|"high"|"critical").`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(context) },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${errBody}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq: respuesta vacía');

  return parseAgentJson(content);
}

async function executeWithGemini(agentType: string, context: object): Promise<AgentDecision> {
  const ai = getGeminiClient();
  if (!ai) throw new Error('GEMINI_API_KEY no configurada');

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify(context),
    config: {
      systemInstruction: systemInstructions[agentType as keyof typeof systemInstructions],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING },
          confidence_score: { type: Type.NUMBER },
          reason: { type: Type.STRING },
          requires_human_approval: { type: Type.BOOLEAN },
          account_code: { type: Type.STRING },
          account_name: { type: Type.STRING },
          tax_deductible: { type: Type.BOOLEAN },
          alert_type: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['low', 'medium', 'high', 'critical'] }
        },
        required: ["decision", "confidence_score", "reason", "requires_human_approval"]
      }
    }
  });

  return JSON.parse(response.text || '{}') as AgentDecision;
}

function localFallbackDecision(agentType: string, context: any): AgentDecision {
  const amount = Number(context?.monto || 0);
  const concept = String(context?.concepto || '').toLowerCase();
  const provider = String(context?.proveedor || '').toLowerCase();

  if (agentType === AGENT_TYPES.CLASIFICADOR) {
    if (concept.includes('nómina') || concept.includes('honorario')) {
      return {
        decision: 'clasificar_nomina_honorarios',
        confidence_score: 0.9,
        reason: 'Clasificación local por palabras clave',
        requires_human_approval: amount > 50000,
        account_name: 'Nómina y Honorarios',
      };
    }
    if (concept.includes('luz') || concept.includes('renta') || concept.includes('servicio') || provider.includes('cfe')) {
      return {
        decision: 'clasificar_gasto_operativo',
        confidence_score: 0.86,
        reason: 'Clasificación local por proveedor/concepto',
        requires_human_approval: amount > 50000,
        account_name: 'Gastos Operativos',
      };
    }
    if (concept.includes('publicidad') || concept.includes('marketing')) {
      return {
        decision: 'clasificar_marketing',
        confidence_score: 0.84,
        reason: 'Clasificación local por palabras clave',
        requires_human_approval: amount > 50000,
        account_name: 'Marketing y Publicidad',
      };
    }
    return {
      decision: 'clasificar_insumos',
      confidence_score: 0.75,
      reason: 'Regla local por defecto',
      requires_human_approval: amount > 50000,
      account_name: 'Insumos y Mercancías',
    };
  }

  return {
    decision: 'revision_manual',
    confidence_score: 0.6,
    reason: 'Fallback local para continuidad operativa',
    requires_human_approval: true,
  };
}

export async function executeAgent(agentType: string, context: object): Promise<AgentDecision> {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);

  if (hasGemini) {
    try {
      return await executeWithGemini(agentType, context);
    } catch (error) {
      console.error('Gemini no disponible:', error);
      if (hasGroq) {
        try {
          return await executeWithGroq(agentType, context);
        } catch (groqErr) {
          console.error('Groq (respaldo tras Gemini) falló:', groqErr);
        }
      }
      return localFallbackDecision(agentType, context);
    }
  }

  if (hasGroq) {
    try {
      return await executeWithGroq(agentType, context);
    } catch (error) {
      console.error('Groq no disponible:', error);
      return localFallbackDecision(agentType, context);
    }
  }

  return localFallbackDecision(agentType, context);
}
