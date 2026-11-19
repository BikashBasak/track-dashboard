import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getApp, getTopCharts, searchApps } from "@/lib/playstore/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const collection = (searchParams.get("collection") || "TOP_FREE") as "TOP_FREE" | "TOP_PAID" | "GROSSING";
  const category = searchParams.get("category") || "";
  const price = (searchParams.get("price") || "all") as "all" | "free" | "paid";
  const num = Math.min(40, Math.max(8, Number(searchParams.get("num") || 24) || 24));
  const store = storefrontFrom(request);

  try {
    if (q.length >= 2) {
      const apps = await searchApps(q, store, num, price);
      return Response.json({ mode: "search", query: q, store, apps });
    }
    const apps = await getTopCharts(collection, store, category || undefined, num);
    return Response.json({ mode: "charts", collection, category, store, apps });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Explorer lookup failed", 502);
  }
}

export async function POST(request: NextRequest) {
  const store = storefrontFrom(request);
  const body = (await request.json()) as { appIds?: string[] };
  const ids = (body.appIds || []).slice(0, 8);
  const apps = await Promise.all(
    ids.map(async (appId) => {
      try {
        return await getApp(appId, store);
      } catch {
        return null;
      }
    }),
  );
  return Response.json({ apps: apps.filter(Boolean) });
}
