import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { hasGeminiApiKey } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * No secrets returned — only whether required env is present at runtime.
 * Open /api/health on your deployed site to verify Vercel env injection.
 */
export function GET() {
  noStore();
  return NextResponse.json({
    ok: true,
    geminiConfigured: hasGeminiApiKey(),
    firebaseConfigured: isFirebaseConfigured(),
  });
}
