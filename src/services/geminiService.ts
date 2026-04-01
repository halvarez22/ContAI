import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

export async function executeAgent(agentType: string, context: object): Promise<AgentDecision> {
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
  };

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

  return JSON.parse(response.text || '{}');
}
