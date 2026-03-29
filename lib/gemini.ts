import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

/** Thrown when no API key is found in env (see isMissingGeminiApiKeyError). */
export const MISSING_GEMINI_API_KEY = "MISSING_GEMINI_API_KEY";

function resolveGeminiApiKey(): string {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_API_KEY,
  ];
  for (const k of candidates) {
    const t = k?.trim();
    if (t) return t;
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
