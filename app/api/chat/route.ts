import { NextRequest } from "next/server";
import { isMissingGeminiApiKeyError, streamChat } from "@/lib/gemini";
import { loadContextTextForChat } from "@/lib/recipe-context-store";

export const runtime = "nodejs";
export const maxDuration = 30;

function buildSystemPrompt(contextText: string): string {
  if (!contextText.trim()) {
    return `You are Recipe Hunter, a personal assistant.

IMPORTANT: No context files have been uploaded yet.
You must politely tell the user that you can only answer from uploaded files, and ask them to upload their recipe files first using the upload panel on the left.
Do NOT answer from general knowledge or the web under any circumstances.`;
  }

  return `You are Recipe Hunter, a personal cooking assistant for Rishav.

YOUR ONLY JOB: Answer questions strictly and only using the content from the uploaded files provided below.

STRICT RULES:
1. NEVER use general knowledge, internet knowledge, or information not present in the uploaded files.
2. If the answer is not found in the uploaded files, say clearly: "I couldn't find this in your uploaded files. Please upload more context files with this information."
3. Do NOT make up or guess any information.
4. Always quote or reference which file you found the answer in.
5. Be helpful, warm and conversational in tone.
6. If asked about something unrelated to the uploaded content, politely redirect.

=== YOUR CONTEXT FILES ===

${contextText}

=== END OF CONTEXT FILES ===

Now answer the user's question using ONLY the above content.`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Messages array is required", { status: 400 });
    }

    const contextText = await loadContextTextForChat();
    const systemPrompt = buildSystemPrompt(contextText);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat(systemPrompt, messages)) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          const userText = isMissingGeminiApiKeyError(err)
            ? "Error: No Gemini API key found. Add GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GOOGLE_API_KEY to .env.local (local), or Project → Settings → Environment Variables on Vercel (production). Get a key at https://aistudio.google.com/apikey"
            : "Sorry, something went wrong. Please try again.";
          controller.enqueue(new TextEncoder().encode(userText));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
