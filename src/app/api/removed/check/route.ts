import { NextRequest } from "next/server";
import { jsonError, storefrontFrom } from "@/lib/api";
import { classifyPlayError, type PresenceRow } from "@/lib/playstore/presence";
import { confirmationCountries } from "@/lib/playstore/markets";
import { getApp, getDeveloperApps } from "@/lib/playstore/provider";
import type { AppDetails, Storefront } from "@/lib/playstore/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type AppRow = PresenceRow & { app?: AppDetails; foundIn?: string };

async function checkApp(id: string, store: Storefront): Promise<AppRow> {
  const countries = confirmationCountries(store.country);
  let lastError: unknown;

  for (const [index, country] of countries.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const app = await getApp(id, { country, lang: store.lang });
      return {
        id,
        status: "live",
        live: true,
        title: app.title,
        app,
        foundIn: country,
      };
    } catch (error) {
      lastError = error;
      const classified = classifyPlayError(error);
      // Hard errors (rate limit / parse) should not keep probing forever as "gone".
      if (classified === "uncertain") {
        return {
          id,
          status: "uncertain",
          live: false,
          error: error instanceof Error ? error.message : "App lookup flaky",
        };
      }
      // 404 in this country → try next market.
    }
  }

  const status = classifyPlayError(lastError);
  return {
    id,
    status,
    live: false,
    error:
      status === "gone"
        ? `Not listed on Google Play in ${countries.join(", ").toUpperCase()}`
        : lastError instanceof Error
          ? lastError.message
          : "App lookup failed",
  };
}

async function checkAccount(id: string, store: Storefront): Promise<PresenceRow & { foundIn?: string }> {
  const countries = confirmationCountries(store.country);
  let lastError: unknown;

  for (const [index, country] of countries.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const catalog = await getDeveloperApps(id, { country, lang: store.lang }, 8);
      if (!catalog.length) continue;
      return {
        id,
        status: "live",
        live: true,
        name: catalog[0]?.developer,
        foundIn: country,
      };
    } catch (error) {
      lastError = error;
      if (classifyPlayError(error) === "uncertain") {
        return {
          id,
          status: "uncertain",
          live: false,
          error: error instanceof Error ? error.message : "Account lookup flaky",
        };
      }
    }
  }

  const status = classifyPlayError(lastError);
  return {
    id,
    status,
    live: false,
    error:
      status === "gone"
        ? `Publisher not listed on Google Play in ${countries.join(", ").toUpperCase()}`
        : lastError instanceof Error
          ? lastError.message
          : "Account lookup failed",
  };
}

export async function POST(request: NextRequest) {
  const store = storefrontFrom(request);
  const body = (await request.json()) as { appIds?: string[]; developerIds?: string[] };
  const appIds = (body.appIds || []).slice(0, 4);
  const developerIds = (body.developerIds || []).slice(0, 4);

  try {
    const apps: AppRow[] = [];
    for (const [index, id] of appIds.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 400));
      apps.push(await checkApp(id, store));
    }
    const accounts: Array<PresenceRow & { foundIn?: string }> = [];
    for (const [index, id] of developerIds.entries()) {
      if (index > 0 || appIds.length) await new Promise((resolve) => setTimeout(resolve, 400));
      accounts.push(await checkAccount(id, store));
    }
    return Response.json({ apps, accounts });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Recheck failed", 502);
  }
}
