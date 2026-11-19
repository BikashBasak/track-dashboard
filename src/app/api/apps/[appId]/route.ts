import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { deriveAppMetrics } from "@/lib/playstore/metrics";
import { getApp } from "@/lib/playstore/provider";
import { readStore } from "@/lib/store/db";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ appId: string }> },
) {
  const { appId } = await context.params;
  if (!appId) return jsonError("Missing app id");
  try {
    const store = storefrontFrom(request);
    const app = await getApp(decodeURIComponent(appId), store);
    const local = await readStore();
    const tracked = local.apps.find((a) => a.appId === app.appId) ?? null;
    return Response.json({
      app,
      metrics: deriveAppMetrics(app),
      tracked,
      store,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "App lookup failed", 502);
  }
}
