import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { suggestTerms } from "@/lib/playstore/provider";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) return Response.json({ suggestions: [] });
  try {
    const suggestions = await suggestTerms(q, storefrontFrom(request));
    return Response.json({ suggestions });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Suggest failed", 502);
  }
}
