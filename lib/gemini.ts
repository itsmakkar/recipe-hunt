import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("GEMINI_API_KEY is not set.");
  }
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
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
