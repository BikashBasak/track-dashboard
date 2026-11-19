import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { searchPublishers } from "@/lib/playstore/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) return jsonError("Type at least 2 characters.");
  const store = storefrontFrom(request);
  try {
    const results = await searchPublishers(q, store);
    return Response.json({ query: q, store, results });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Publisher search failed", 502);
  }
}
