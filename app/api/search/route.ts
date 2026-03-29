import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

// The specific chefs and channels we want to target
const CHEF_SOURCES = [
  "site:youtube.com chef rajasekarallwin",
  "site:instagram.com chef_rajasekarallwin",
  "site:youtube.com shuchiruchi ismail",
  "site:instagram.com shuchiruchi_",
  "site:youtube.com cookingshooking",
];

const CHEF_NAMES = [
  "Chef Rajasekarallwin",
  "Chef Ismail Shuchi Ruchi",
  "CookingShooking",
  "Rekha cooking",
];

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
      return NextResponse.json({ results: [], error: "Search not configured" });
    }

    // Build targeted queries for each chef
    const searchQuery = `${query} ${CHEF_NAMES.join(" OR ")} South Indian recipe`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(searchQuery)}&num=5`;

    const res = await fetch(url);
    const data = await res.json() as {
      items?: Array<{
        title: string;
        link: string;
        snippet: string;
      }>;
    };

    const results = (data.items || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ results: [], error: "Search failed" });
  }
}
