import { NextRequest } from "next/server";
import { connection } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { isMissingGeminiApiKeyError, streamChat } from "@/lib/gemini";
import { loadContextTextForChat } from "@/lib/recipe-context-store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Priority order: recipe/transcript files first, large social archives last
// This ensures the most useful content fits within the token budget
const FILE_PRIORITY_KEYWORDS = [
  "recipe", "transcript", "masterclass", "dosa", "master_index",
  "benne", "mysore", "deepakks", "kitchen"
];

function smartTruncateContext(rawContext: string): string {
  // Split into individual file blocks
  const fileBlocks = rawContext.split(/\n\n(?=--- FILE:)/);

  // Score each block — recipe/transcript files get higher priority
  const scored = fileBlocks.map((block) => {
    const nameLine = block.match(/--- FILE: ([^\n]+) ---/)?.[1]?.toLowerCase() || "";
    const isPriority = FILE_PRIORITY_KEYWORDS.some((kw) => nameLine.includes(kw));
    return { block, priority: isPriority ? 0 : 1, size: block.length };
  });

  // Sort: priority files first, then by size ascending (smaller first)
  scored.sort((a, b) => a.priority - b.priority || a.size - b.size);

  // Cap total context at 90,000 chars (~22,500 tokens) — safe for gemini-2.0-flash
  const MAX_CHARS = 90_000;
  let total = 0;
  const kept: string[] = [];

  for (const { block } of scored) {
    if (total + block.length > MAX_CHARS) {
      // Add a truncation note so the bot knows there's more data
      kept.push(`--- NOTE: Some large files were truncated to fit context limits. Core recipe files are fully included. ---`);
      break;
    }
    kept.push(block);
    total += block.length;
  }

  return kept.join("\n\n");
}

function buildSystemPrompt(contextText: string): string {
  if (!contextText.trim()) {
    return `You are Recipe Hunter, a personal cooking research assistant for Rishav.

IMPORTANT: No context files have been uploaded yet.
Tell the user to upload their recipe/content files using the upload panel on the left.
Do NOT answer from general knowledge.`;
  }

  const context = smartTruncateContext(contextText);

  return `You are Recipe Hunter — Rishav's personal cooking research assistant.

YOUR PURPOSE: Give deep, thorough, well-researched answers using ONLY the uploaded files below.

HOW TO ANSWER (follow this every time):
1. READ ALL files carefully before answering — the answer may be spread across multiple files.
2. SYNTHESIZE information from multiple files when relevant. Do not stop at the first match.
3. Give COMPLETE answers — full ingredient lists, full steps, all relevant details found in the files.
4. When you find a YouTube video or Instagram post relevant to the question, ALWAYS include the URL as a clickable link.
5. If multiple recipes/approaches exist across files, compare and present all of them.
6. Mention which file each piece of information came from.
7. NEVER use general knowledge. If something is not in the files, say: "This specific detail isn't in your uploaded files."
8. Format answers clearly: use headings, numbered steps, and bullet points for ingredients.

LINK FORMAT: Always show URLs as: [Video Title](URL) or [View post](URL)

=== YOUR UPLOADED FILES ===

${context}

=== END OF FILES ===

Now thoroughly research all files above and give Rishav the best possible answer.`;
}

export async function POST(req: NextRequest) {
  noStore();
  await connection();

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
            ? "Error: No Gemini API key at runtime. In Vercel set GEMINI_API_KEY for Production (and Preview if you use it), then Redeploy. Open /api/health on your site — geminiConfigured should be true. Local: .env.local. Key: https://aistudio.google.com/apikey"
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
