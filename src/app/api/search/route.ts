import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getApp, searchApps } from "@/lib/playstore/provider";
import { isPackageId } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) return jsonError("Type at least 2 characters.");
  const store = storefrontFrom(request);

  try {
    if (isPackageId(q)) {
      try {
        const app = await getApp(q, store);
        return Response.json({ query: q, store, results: [app], exact: true });
      } catch {
        // fall through to name search
      }
    }
    const results = await searchApps(q, store, 24);
    return Response.json({ query: q, store, results, exact: false });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Search failed", 502);
  }
}
