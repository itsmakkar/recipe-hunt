import process from "node:process";
import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

export const MISSING_GEMINI_API_KEY = "MISSING_GEMINI_API_KEY";

const GEMINI_ENV_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

function resolveGeminiApiKey(): string {
  const env = process.env;
  for (const k of GEMINI_ENV_KEYS) {
    const v = env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  throw new Error(MISSING_GEMINI_API_KEY);
}

export function hasGeminiApiKey(): boolean {
  try {
    resolveGeminiApiKey();
    return true;
  } catch {
    return false;
  }
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

  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

  const response = await getAI().models.generateContentStream({
    model: modelId,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
    contents,
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) yield text;
  }
}
