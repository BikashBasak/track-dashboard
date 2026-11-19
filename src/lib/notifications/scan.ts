import type { AppDetails, AppSummary, TrackedAccount, TrackedApp } from "@/lib/playstore/types";
import { checkPlayPresence, goneIds } from "@/lib/sync/check";

type ScanWatch = {
  data: { apps: TrackedApp[]; accounts: TrackedAccount[] };
  applyAppSnapshot: (app: AppDetails) => void;
  applyAccountSnapshot: (input: {
    developerId: string;
    name: string;
    sampleIcon?: string;
    apps: AppSummary[];
  }) => void;
  markAppUnpublishedLocal: (appId: string) => void;
  untrackAccountLocal: (developerId: string, reason?: "untracked" | "play-removed") => void;
};

export type NotificationScanResult = {
  refreshedApps: number;
  refreshedAccounts: number;
  removedApps: number;
  removedAccounts: number;
  errors: string[];
};

async function checkGone(qs: string, appIds: string[], developerIds: string[]) {
  const goneApps: string[] = [];
  const goneAccounts: string[] = [];
  const ids = [...appIds.map((id) => ({ kind: "app" as const, id })), ...developerIds.map((id) => ({ kind: "account" as const, id }))];
  for (let i = 0; i < ids.length; i += 4) {
    const chunk = ids.slice(i, i + 4);
    const data = await checkPlayPresence(qs, {
      appIds: chunk.filter((c) => c.kind === "app").map((c) => c.id),
      developerIds: chunk.filter((c) => c.kind === "account").map((c) => c.id),
    });
    goneApps.push(...goneIds(data.apps));
    goneAccounts.push(...goneIds(data.accounts));
  }
  return { goneApps, goneAccounts };
}

export async function runNotificationScan(qs: string, watch: ScanWatch): Promise<NotificationScanResult> {
  const errors: string[] = [];
  let refreshedApps = 0;
  let refreshedAccounts = 0;

  const apps = [...watch.data.apps];
  const accounts = [...watch.data.accounts];

  for (const app of apps) {
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(app.appId)}?${qs}`);
      const json = await res.json();
      if (!res.ok || !json.app) throw new Error(json.error || "Failed");
      watch.applyAppSnapshot(json.app);
      refreshedApps += 1;
    } catch (error) {
      errors.push(`${app.title}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  for (const account of accounts) {
    try {
      const res = await fetch(`/api/developers/${encodeURIComponent(account.developerId)}?${qs}&mergeMarkets=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      watch.applyAccountSnapshot({
        developerId: account.developerId,
        name: json.name || account.name,
        sampleIcon: json.apps?.[0]?.icon,
        apps: json.apps || [],
      });
      refreshedAccounts += 1;
    } catch (error) {
      errors.push(`${account.name}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  let removedApps = 0;
  let removedAccounts = 0;
  try {
    const { goneApps, goneAccounts } = await checkGone(
      qs,
      apps.map((a) => a.appId),
      accounts.map((a) => a.developerId),
    );
    for (const id of goneApps) {
      watch.markAppUnpublishedLocal(id);
      removedApps += 1;
    }
    for (const id of goneAccounts) {
      watch.untrackAccountLocal(id, "play-removed");
      removedAccounts += 1;
    }
  } catch (error) {
    errors.push(`Play takedown scan: ${error instanceof Error ? error.message : "failed"}`);
  }

  return { refreshedApps, refreshedAccounts, removedApps, removedAccounts, errors };
}
