import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getDeveloperApps, getDeveloperAppsMerged } from "@/lib/playstore/provider";
import { readStore } from "@/lib/store/db";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ devId: string }> },
) {
  const { devId } = await context.params;
  const developerId = decodeURIComponent(devId);
  if (!developerId) return jsonError("Missing developer id");
  const store = storefrontFrom(request);
  const mergeMarkets = new URL(request.url).searchParams.get("mergeMarkets") === "1";

  try {
    const merged = mergeMarkets
      ? await getDeveloperAppsMerged(developerId, store, 80)
      : {
          apps: await getDeveloperApps(developerId, store, 80),
          markets: [store.country],
          name: "",
        };
    const apps = merged.apps;
    const scores = apps.map((a) => a.score).filter((s): s is number => typeof s === "number");
    const local = await readStore();
    const tracked = local.accounts.find((a) => a.developerId === developerId) ?? null;
    const name = merged.name || apps[0]?.developer || tracked?.name || developerId;
    return Response.json({
      developerId,
      name,
      apps,
      markets: merged.markets,
      stats: {
        appCount: apps.length,
        avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        totalMinInstalls: apps.reduce((sum, a) => sum + (a.minInstalls ?? 0), 0),
        freeCount: apps.filter((a) => a.free).length,
        paidCount: apps.filter((a) => !a.free).length,
        genres: [...new Set(apps.map((a) => a.genre).filter(Boolean))],
      },
      tracked,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Developer lookup failed", 502);
  }
}
