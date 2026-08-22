import type { MonthlyContextPack } from '../lib/monthlyAnalysis';
import { completeText } from './groqAIService';
import { logAuditEntry } from './auditService';

export async function generateExecutiveBriefing(pack: MonthlyContextPack): Promise<string> {
  const system = `Eres un asistente para dirección financiera en México. Genera un BORRADOR EJECUTIVO claro en español.
Reglas estrictas:
- Usa SOLO cifras y hechos presentes en el JSON. No inventes datos.
- Si falta información, dilo explícitamente.
- Si el JSON incluye "fiscal" (IVA del mes, ISR estimado YTD), incorpora un apartado breve "Fiscal (informativo)" aclarando que son estimaciones internas y no sustituyen declaraciones ante el SAT.
- Estructura con títulos: Resumen del periodo, Ingresos y egresos, Principales categorías/cuentas, Concentración de proveedores (egresos), Riesgos u observaciones (solo si se desprenden de los datos), Próximos pasos sugeridos (genéricos).
- Tono profesional y breve (máximo ~800 palabras).
- Incluye al inicio: empresa y RFC si vienen en el JSON.`;

  const { text, modelUsed, tokensUsed } = await completeText(
    system,
    JSON.stringify(pack),
    0.4
  );

  await logAuditEntry(
    'AI_INSIGHTS_BRIEFING',
    'ai_service',
    { chars: text.length },
    { provider: 'groq', modelUsed, tokensUsed }
  );

  return text;
}

export async function askMonthQuestion(question: string, pack: MonthlyContextPack): Promise<string> {
  const system = `Eres un analista contable. Responde en español SOLO con base en el JSON del periodo.
Reglas:
- Si la pregunta no puede responderse con esos datos, dilo y sugiere qué dato faltaría.
- Sé conciso. Puedes hacer sumas/comparaciones explícitas a partir de los números del JSON.
- No inventes transacciones ni montos.`;

  const { text, modelUsed, tokensUsed } = await completeText(
    system,
    `Pregunta del usuario:\n${question}\n\nDatos del periodo (JSON):\n${JSON.stringify(pack)}`,
    0.25
  );

  await logAuditEntry(
    'AI_INSIGHTS_QA',
    'ai_service',
    { questionPreview: question.slice(0, 120), chars: text.length },
    { provider: 'groq', modelUsed, tokensUsed }
  );

  return text;
}
