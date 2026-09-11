/**
 * Nombres de modelos de IA desde env o defaults tipados.
 * No decide qué provider usar — solo centraliza strings.
 * Fase 1 / H3: solo Groq en runtime (gemini reservado en audit schema).
 */

function envOr(value: string | undefined, fallback: string): string {
  const t = value?.trim();
  return t ? t : fallback;
}

export const AI_MODELS = {
  /**
   * Default: modelo de plan Developer en GroqCloud (ago/sep 2026).
   * `llama-3.3-70b-versatile` pasó a Enterprise y responde 404 en keys free/dev.
   * Override: env GROQ_MODEL (Vercel / .env.local).
   */
  groq: envOr(
    typeof process !== 'undefined' ? process.env.GROQ_MODEL : undefined,
    'openai/gpt-oss-20b'
  ),
} as const;
