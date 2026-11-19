import type { AppDetails, AppSummary, RemovedReason, TrackedAccount, TrackedApp } from "@/lib/playstore/types";
import { unreadCount } from "@/lib/notifications/store";
import { checkPlayPresence } from "@/lib/sync/check";
import { FULL_SYNC_GAP_MS } from "@/lib/sync/constants";
import { readFullSyncMeta, writeFullSyncMeta } from "@/lib/sync/full-sync-meta";
import { deepSyncAccountCatalog } from "@/lib/sync/reload-category";

export type FullSyncMode = "baseline" | "verify";

export type FullSyncResult = {
  mode: FullSyncMode;
  appsOk: number;
  accountsOk: number;
  appsChecked: number;
  removedApps: number;
  removedAccounts: number;
  alerts: number;
  errors: string[];
  total: number;
};

type FullSyncWatch = {
  data: { apps: TrackedApp[]; accounts: TrackedAccount[] };
  applyAppSnapshot: (app: AppDetails) => void;
  applyAppSnapshotSilent: (app: AppDetails) => void;
  applyAccountSnapshot: (input: {
    developerId: string;
    name: string;
    sampleIcon?: string;
    apps: AppSummary[];
  }) => void;
  applyAccountSnapshotSilent: (input: {
    developerId: string;
    name: string;
    sampleIcon?: string;
    apps: AppSummary[];
  }) => void;
  markAppUnpublishedLocal: (appId: string) => void;
  untrackAccountLocal: (developerId: string, reason?: RemovedReason) => void;
  getTrackedApp: (appId: string) => TrackedApp | null;
  getTrackedAccount: (developerId: string) => TrackedAccount | null;
  rememberAccountListings: Parameters<typeof deepSyncAccountCatalog>[3]["rememberAccountListings"];
  rememberAccountCatalog: Parameters<typeof deepSyncAccountCatalog>[3]["rememberAccountCatalog"];
  archivePlayRemovedApp: Parameters<typeof deepSyncAccountCatalog>[3]["archivePlayRemovedApp"];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveFullSyncMode(forceBaseline = false): FullSyncMode {
  if (forceBaseline) return "baseline";
  return readFullSyncMeta().baselineReady ? "verify" : "baseline";
}

/**
 * Sync every tracked app + account.
 * - baseline: store listings in local DB only (no change notifications / no removals)
 * - verify: compare to stored baseline and notify (name, description, screenshots, new app, removed, …)
 */
export async function runFullSync(
  qs: string,
  watch: FullSyncWatch,
  options?: {
    forceBaseline?: boolean;
    onProgress?: (done: number, total: number, label: string) => void;
  },
): Promise<FullSyncResult> {
  const mode = resolveFullSyncMode(options?.forceBaseline);
  const notify = mode === "verify";
  const apps = [...watch.data.apps];
  const accounts = [...watch.data.accounts];
  const total = apps.length + accounts.length;
  const errors: string[] = [];
  let appsOk = 0;
  let accountsOk = 0;
  let appsChecked = 0;
  let removedApps = 0;
  let removedAccounts = 0;
  let alerts = 0;
  const unreadBefore = notify ? unreadCount() : 0;
  let done = 0;

  const accountWatch = {
    applyAccountSnapshot: notify ? watch.applyAccountSnapshot : watch.applyAccountSnapshotSilent,
    applyAccountSnapshotSilent: watch.applyAccountSnapshotSilent,
    untrackAccountLocal: watch.untrackAccountLocal,
    applyAppSnapshot: notify ? watch.applyAppSnapshot : watch.applyAppSnapshotSilent,
    applyAppSnapshotSilent: watch.applyAppSnapshotSilent,
    markAppUnpublishedLocal: watch.markAppUnpublishedLocal,
    getTrackedApp: watch.getTrackedApp,
    getTrackedAccount: watch.getTrackedAccount,
    rememberAccountListings: watch.rememberAccountListings,
    rememberAccountCatalog: watch.rememberAccountCatalog,
    archivePlayRemovedApp: watch.archivePlayRemovedApp,
  };

  for (const app of apps) {
    options?.onProgress?.(done, total, app.title);
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(app.appId)}?${qs}`);
      const json = await res.json();
      if (res.ok && json.app) {
        if (notify) watch.applyAppSnapshot(json.app as AppDetails);
        else watch.applyAppSnapshotSilent(json.app as AppDetails);
        appsOk += 1;
      } else if (notify) {
        const presence = await checkPlayPresence(qs, { appIds: [app.appId] });
        const status = presence.apps[0]?.status ?? "uncertain";
        if (status === "gone") {
          watch.markAppUnpublishedLocal(app.appId);
          removedApps += 1;
        } else if (status === "live" && presence.apps[0]?.app) {
          watch.applyAppSnapshot(presence.apps[0].app);
          appsOk += 1;
        } else {
          errors.push(`${app.title}: ${json.error || presence.apps[0]?.error || "Play lookup flaky"}`);
        }
      } else {
        errors.push(`${app.title}: ${json.error || "baseline fetch failed — skipped"}`);
      }
    } catch (error) {
      errors.push(`${app.title}: ${error instanceof Error ? error.message : "failed"}`);
    }
    done += 1;
    await sleep(FULL_SYNC_GAP_MS);
  }

  for (const account of accounts) {
    options?.onProgress?.(done, total, account.name);
    const baseline = watch.getTrackedAccount(account.developerId) || account;
    const baselineFrozen: TrackedAccount = {
      ...baseline,
      catalog: baseline.catalog ? [...baseline.catalog] : [],
      lastAppIds: baseline.lastAppIds ? [...baseline.lastAppIds] : [],
      listingMemory: baseline.listingMemory ? { ...baseline.listingMemory } : {},
      snapshots: [...baseline.snapshots],
    };
    try {
      const res = await fetch(`/api/developers/${encodeURIComponent(account.developerId)}?${qs}&mergeMarkets=1`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.apps)) {
        const liveApps = json.apps as AppSummary[];
        if (notify) {
          watch.applyAccountSnapshot({
            developerId: account.developerId,
            name: json.name || account.name,
            sampleIcon: liveApps[0]?.icon,
            apps: liveApps,
          });
        } else {
          watch.applyAccountSnapshotSilent({
            developerId: account.developerId,
            name: json.name || account.name,
            sampleIcon: liveApps[0]?.icon,
            apps: liveApps,
          });
        }
        accountsOk += 1;
        const deep = await deepSyncAccountCatalog(qs, baselineFrozen, liveApps, accountWatch, {
          silent: !notify,
          onAppProgress: (label) => options?.onProgress?.(done, total, `${account.name} · ${label}`),
        });
        appsChecked += deep.checked;
        if (notify) {
          removedApps += deep.removed;
          alerts += deep.alerts;
        }
        errors.push(...deep.errors);
      } else if (notify) {
        const presence = await checkPlayPresence(qs, { developerIds: [account.developerId] });
        const status = presence.accounts[0]?.status ?? "uncertain";
        if (status === "gone") {
          watch.untrackAccountLocal(account.developerId, "play-removed");
          removedAccounts += 1;
        } else {
          errors.push(`${account.name}: ${json.error || presence.accounts[0]?.error || "catalog failed"}`);
        }
      } else {
        errors.push(`${account.name}: ${json.error || "baseline catalog failed — skipped"}`);
      }
    } catch (error) {
      errors.push(`${account.name}: ${error instanceof Error ? error.message : "failed"}`);
    }
    done += 1;
    await sleep(FULL_SYNC_GAP_MS);
  }

  options?.onProgress?.(total, total, "");

  if (notify) {
    alerts = Math.max(alerts, Math.max(0, unreadCount() - unreadBefore));
  }

  const message =
    mode === "baseline"
      ? `Baseline saved for ${appsOk} app${appsOk === 1 ? "" : "s"} and ${accountsOk} account${accountsOk === 1 ? "" : "s"}. Next Sync all will compare and notify.`
      : `Verified ${appsOk} app${appsOk === 1 ? "" : "s"} and ${accountsOk} account${accountsOk === 1 ? "" : "s"}.${alerts ? ` ${alerts} notification${alerts === 1 ? "" : "s"}.` : " No listing changes."}`;

  writeFullSyncMeta({
    baselineReady: true,
    lastFullSyncAt: Date.now(),
    lastFullSyncMode: mode,
    lastMessage: message,
  });

  return {
    mode,
    appsOk,
    accountsOk,
    appsChecked,
    removedApps,
    removedAccounts,
    alerts,
    errors,
    total,
  };
}
