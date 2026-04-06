import type { MonthlyContextPack } from '../lib/monthlyAnalysis';

async function groqCompletion(systemPrompt: string, userContent: string, temperature = 0.35): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error('Configura GROQ_API_KEY para usar insights con IA.');
  }

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
        { role: 'user', content: userContent },
      ],
      temperature,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Respuesta vacía del modelo');
  return text.trim();
}

export async function generateExecutiveBriefing(pack: MonthlyContextPack): Promise<string> {
  const system = `Eres un asistente para dirección financiera en México. Genera un BORRADOR EJECUTIVO claro en español.
Reglas estrictas:
- Usa SOLO cifras y hechos presentes en el JSON. No inventes datos.
- Si falta información, dilo explícitamente.
- Si el JSON incluye "fiscal" (IVA del mes, ISR estimado YTD), incorpora un apartado breve "Fiscal (informativo)" aclarando que son estimaciones internas y no sustituyen declaraciones ante el SAT.
- Estructura con títulos: Resumen del periodo, Ingresos y egresos, Principales categorías/cuentas, Concentración de proveedores (egresos), Riesgos u observaciones (solo si se desprenden de los datos), Próximos pasos sugeridos (genéricos).
- Tono profesional y breve (máximo ~800 palabras).
- Incluye al inicio: empresa y RFC si vienen en el JSON.`;

  return groqCompletion(system, JSON.stringify(pack), 0.4);
}

export async function askMonthQuestion(question: string, pack: MonthlyContextPack): Promise<string> {
  const system = `Eres un analista contable. Responde en español SOLO con base en el JSON del periodo.
Reglas:
- Si la pregunta no puede responderse con esos datos, dilo y sugiere qué dato faltaría.
- Sé conciso. Puedes hacer sumas/comparaciones explícitas a partir de los números del JSON.
- No inventes transacciones ni montos.`;

  return groqCompletion(system, `Pregunta del usuario:\n${question}\n\nDatos del periodo (JSON):\n${JSON.stringify(pack)}`, 0.25);
}
