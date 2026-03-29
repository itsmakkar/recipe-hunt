import { NextRequest } from "next/server";
import { connection } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { isMissingGeminiApiKeyError, streamChat } from "@/lib/gemini";
import { loadContextTextForChat } from "@/lib/recipe-context-store";

export const runtime = "nodejs";
export const maxDuration = 10; // Vercel Hobby plan max
export const dynamic = "force-dynamic";

// ─── Chef knowledge base ────────────────────────────────────────────────────
// These are the specific chefs/channels in Rishav's knowledge base.
// Used to build targeted web searches and give source-specific answers.
const CHEF_CONTEXT = `
CHEFS IN YOUR KNOWLEDGE BASE:
1. Chef Rajasekarallwin — South Indian specialist (Benne Dosa, Idli, Sambar, Biryani)
   YouTube: https://www.youtube.com/channel/UCbWqtHCFJTd2QPT8_keGCEQ
   Instagram: https://www.instagram.com/chef_rajasekarallwin/
   Training: +91 88612 90186 | +91 79758 20779

2. Chef Ismail (Shuchi Ruchi / OggaraneDabbi) — South Indian breakfast & entrepreneur training
   YouTube: search "Shuchi Ruchi Ismail" on YouTube
   Instagram: https://www.instagram.com/shuchiruchi_/
   Training WhatsApp: 9448804902

3. CookingShooking — Indian street food & North Indian snacks
   YouTube: search "CookingShooking" on YouTube

4. Rekha — Kannada home cooking, gravies, chutneys
   YouTube: search "Rekha cooking Kannada" on YouTube
`.trim();

// ─── Smart context truncation ────────────────────────────────────────────────
// Prioritise actual recipe/transcript files over large social media archives.
// Hard cap at 28k chars to stay inside Vercel Hobby 10 s timeout.
const PRIORITY_KEYWORDS = [
  "recipe", "transcript", "masterclass", "master_index",
  "dosa", "benne", "mysore", "deepakks", "kitchen",
];

function smartTruncateContext(raw: string): string {
  const blocks = raw.split(/\n\n(?=--- FILE:)/);

  const scored = blocks.map((block) => {
    const name = block.match(/--- FILE: ([^\n]+) ---/)?.[1]?.toLowerCase() ?? "";
    const priority = PRIORITY_KEYWORDS.some((kw) => name.includes(kw)) ? 0 : 1;
    return { block, priority, size: block.length };
  });

  scored.sort((a, b) => a.priority - b.priority || a.size - b.size);

  const MAX_CHARS = 28_000;
  let total = 0;
  const kept: string[] = [];

  for (const { block } of scored) {
    if (total + block.length > MAX_CHARS) {
      kept.push("--- NOTE: Remaining files omitted — core recipe files fully included. ---");
      break;
    }
    kept.push(block);
    total += block.length;
  }

  return kept.join("\n\n");
}

// ─── Web browse: fetch a URL and extract plain text ─────────────────────────
async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeHunterBot/1.0)" },
      signal: AbortSignal.timeout(4000),
    });
    const html = await res.text();
    // Strip tags, collapse whitespace — rough but fast
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim()
      .slice(0, 3000); // keep first 3k chars of each page
    return text;
  } catch {
    return "";
  }
}

// ─── Extract relevant URLs from context files ────────────────────────────────
// Pull YouTube / Instagram URLs from context that are relevant to the question
function extractRelevantUrls(contextText: string, question: string): string[] {
  const questionWords = question.toLowerCase().split(/\s+/);
  const lines = contextText.split("\n");
  const urls: string[] = [];

  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/[^\s"']+/);
    if (!urlMatch) continue;
    const url = urlMatch[0];
    // Only YouTube and Instagram URLs
    if (!url.includes("youtube.com") && !url.includes("instagram.com")) continue;
    // Check if surrounding lines mention question keywords
    const lineLower = line.toLowerCase();
    const isRelevant = questionWords.some(
      (word) => word.length > 3 && lineLower.includes(word)
    );
    if (isRelevant && !urls.includes(url)) urls.push(url);
    if (urls.length >= 3) break; // limit to 3 URLs to stay within timeout
  }

  return urls;
}

// ─── Build system prompt ─────────────────────────────────────────────────────
function buildSystemPrompt(contextText: string, webContent: string): string {
  if (!contextText.trim()) {
    return `You are Recipe Hunter, Rishav's personal restaurant cooking assistant.
No files uploaded yet. Ask Rishav to upload recipe/context files from the left panel.
Do NOT use general knowledge.`;
  }

  const context = smartTruncateContext(contextText);
  const hasWeb = webContent.trim().length > 0;

  return `You are Recipe Hunter — Rishav's personal restaurant cooking research assistant.

Rishav runs a restaurant and needs PINPOINT, PROFESSIONAL advice — not generic tips.
Your job: give him the exact techniques, ratios, and secrets that top South Indian chefs use.

${CHEF_CONTEXT}

═══════════════════════════════════════════════════
HOW TO ANSWER — FOLLOW THIS EVERY TIME:
═══════════════════════════════════════════════════
1. Search ALL uploaded files first. The answer is often in multiple files.
2. Give EXACT details — specific quantities, exact rice types, fermentation times, oil amounts.
   Not "add oil as needed" — say "Chef Rajasekarallwin uses butter generously on high heat".
3. If you find a YouTube or Instagram URL relevant to the question, INCLUDE IT as a link.
4. If multiple chefs cover the same dish, COMPARE their approaches.
5. Flag restaurant-scale tips separately: batter ratios, batch prep, shelf life, cost tips.
6. NEVER give generic cooking advice. If something isn't in the files${hasWeb ? " or web results" : ""}, say so clearly.
7. Format: use ## headings, numbered steps for method, bullet points for ingredients.
8. End with: "🔗 Related videos/posts:" and list all relevant URLs found.

LINK FORMAT: [Title or description](URL)

═══════════════════════════════════════════════════
YOUR UPLOADED FILES:
═══════════════════════════════════════════════════
${context}
${hasWeb ? `
═══════════════════════════════════════════════════
LIVE WEB CONTENT (fetched for this question):
═══════════════════════════════════════════════════
${webContent}
` : ""}
═══════════════════════════════════════════════════
Now give Rishav the best, most specific restaurant-grade answer possible.`;
}

// ─── Main POST handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  noStore();
  await connection();

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Messages array is required", { status: 400 });
    }

    // Get latest user question
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const question = lastUserMsg?.content ?? "";

    // Load context files from Firebase
    const contextText = await loadContextTextForChat();

    // Browse relevant URLs from the context (parallel, fast)
    let webContent = "";
    if (contextText && question) {
      const urls = extractRelevantUrls(contextText, question);
      if (urls.length > 0) {
        const fetched = await Promise.allSettled(urls.map(fetchUrlText));
        const parts = fetched
          .map((r, i) =>
            r.status === "fulfilled" && r.value
              ? `[Source: ${urls[i]}]\n${r.value}`
              : ""
          )
          .filter(Boolean);
        webContent = parts.join("\n\n---\n\n").slice(0, 6000);
      }
    }

    const systemPrompt = buildSystemPrompt(contextText, webContent);

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
            ? "Error: GEMINI_API_KEY not set in Vercel. Go to Vercel → Settings → Environment Variables and add it, then Redeploy."
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
