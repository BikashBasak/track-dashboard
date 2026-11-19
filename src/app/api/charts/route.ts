import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getTopCharts } from "@/lib/playstore/provider";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collection = (searchParams.get("collection") || "TOP_FREE") as "TOP_FREE" | "TOP_PAID" | "GROSSING";
  const category = searchParams.get("category") || "";
  try {
    const apps = await getTopCharts(collection, storefrontFrom(request), category || undefined, 18);
    return Response.json({ collection, category, apps });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Charts failed", 502);
  }
}
