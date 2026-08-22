/**
 * Nombres de modelos de IA desde env o defaults tipados.
 * No decide qué provider usar — solo centraliza strings.
 */

function envOr(value: string | undefined, fallback: string): string {
  const t = value?.trim();
  return t ? t : fallback;
}

export const AI_MODELS = {
  groq: envOr(
    typeof process !== 'undefined' ? process.env.GROQ_MODEL : undefined,
    'llama-3.3-70b-versatile'
  ),
  gemini: envOr(
    typeof process !== 'undefined' ? process.env.GEMINI_MODEL : undefined,
    'gemini-3-flash-preview'
  ),
} as const;
