import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

/** Thrown when no API key is found in env (see isMissingGeminiApiKeyError). */
export const MISSING_GEMINI_API_KEY = "MISSING_GEMINI_API_KEY";

const GEMINI_ENV_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

/**
 * Resolve API key from the live process environment.
 * Next.js may inline `process.env.GEMINI_API_KEY` at build time (empty if the
 * secret was not present during `next build`). Iterating `process.env` reads
 * runtime values from the host (e.g. Vercel) reliably.
 */
function resolveGeminiApiKey(): string {
  const want = new Set<string>(GEMINI_ENV_KEYS);
  for (const [name, value] of Object.entries(process.env)) {
    if (!want.has(name) || typeof value !== "string") continue;
    const t = value.trim();
    if (t) return t;
  }
  for (const k of GEMINI_ENV_KEYS) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  throw new Error(MISSING_GEMINI_API_KEY);
}

function getAI(): GoogleGenAI {
  const apiKey = resolveGeminiApiKey();
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

export function isMissingGeminiApiKeyError(err: unknown): boolean {
  return err instanceof Error && err.message === MISSING_GEMINI_API_KEY;
}

export async function* streamChat(
  systemPrompt: string,
  messages: { role: string; content: string }[]
) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const response = await getAI().models.generateContentStream({
    model: "gemini-2.0-flash",
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.5,
      maxOutputTokens: 2048,
    },
    contents,
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) yield text;
  }
}
