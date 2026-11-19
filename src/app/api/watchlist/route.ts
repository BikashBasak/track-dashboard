import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { getApp, getDeveloperAppsMerged } from "@/lib/playstore/provider";
import {
  clearRemovedAccounts,
  clearRemovedApps,
  readStore,
  trackAccount,
  trackApp,
  untrackAccount,
  untrackApp,
} from "@/lib/store/db";

export async function GET() {
  const data = await readStore();
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    type?: "app" | "account";
    appId?: string;
    developerId?: string;
    name?: string;
  };
  const store = storefrontFrom(request);

  try {
    if (body.type === "app" && body.appId) {
      const app = await getApp(body.appId, store);
      const tracked = await trackApp(app);
      return Response.json({ tracked });
    }
    if (body.type === "account" && body.developerId) {
      const merged = await getDeveloperAppsMerged(body.developerId, store, 80);
      const apps = merged.apps;
      const tracked = await trackAccount({
        developerId: body.developerId,
        name: body.name || merged.name || apps[0]?.developer || body.developerId,
        sampleIcon: apps[0]?.icon,
        apps,
      });
      return Response.json({ tracked });
    }
    return jsonError("Provide type=app|account and an id");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Track failed", 502);
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");
  if (type === "removed-apps") {
    await clearRemovedApps();
    return Response.json({ ok: true });
  }
  if (type === "removed-accounts") {
    await clearRemovedAccounts();
    return Response.json({ ok: true });
  }
  if (!type || !id) return jsonError("Missing type or id");
  if (type === "app") await untrackApp(id);
  else if (type === "account") await untrackAccount(id);
  else return jsonError("Unknown type");
  return Response.json({ ok: true });
}
