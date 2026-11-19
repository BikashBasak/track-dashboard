import { NextRequest } from "next/server";
import { storefrontFrom } from "@/lib/api";
import { getApp, getDeveloperAppsMerged } from "@/lib/playstore/provider";
import {
  appendAccountSnapshot,
  appendAppSnapshot,
  readStore,
  snapshotFromAccount,
  snapshotFromApp,
} from "@/lib/store/db";

export async function POST(request: NextRequest) {
  const storefront = storefrontFrom(request);
  const data = await readStore();
  const errors: string[] = [];

  for (const app of data.apps) {
    try {
      const live = await getApp(app.appId, storefront);
      await appendAppSnapshot(app.appId, snapshotFromApp(live));
    } catch (error) {
      errors.push(`${app.appId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  for (const account of data.accounts) {
    try {
      const merged = await getDeveloperAppsMerged(account.developerId, storefront, 80);
      const apps = merged.apps;
      await appendAccountSnapshot(account.developerId, snapshotFromAccount(apps), {
        name: merged.name || apps[0]?.developer || account.name,
        sampleIcon: apps[0]?.icon,
        appCount: apps.length,
      });
    } catch (error) {
      errors.push(`${account.developerId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  const refreshed = await readStore();
  return Response.json({ refreshed, errors });
}
