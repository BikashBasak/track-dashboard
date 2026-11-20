import type { AppDetails, AppListingMemory, AppSummary, RemovedReason, TrackedAccount, TrackedApp } from "@/lib/playstore/types";
import { checkPlayPresence } from "@/lib/sync/check";
import { diffListingMemory, draftAppRepublished, republishMarker } from "@/lib/notifications/diff";
import { pushNotifications, unreadCount } from "@/lib/notifications/store";
import { hasDeepListingBaseline, listingMemoryFromApp } from "@/lib/store/snapshots";

const GAP_MS = Math.max(0, Number(process.env.NEXT_PUBLIC_RELOAD_GAP_MS || "800") || 800);
const ACCOUNT_APP_CAP = 40;

export type CategoryReloadResult = {
  ok: number;
  removed: number;
  appsChecked: number;
  appsRemoved: number;
  alerts: number;
  failed: number;
  total: number;
  errors: string[];
};

type AppWatch = {
  applyAppSnapshot: (app: AppDetails) => void;
  markAppUnpublishedLocal: (appId: string) => void;
};

type AccountWatch = {
  applyAccountSnapshot: (input: {
    developerId: string;
    name: string;
    sampleIcon?: string;
    apps: AppSummary[];
  }) => void;
  untrackAccountLocal: (developerId: string, reason?: RemovedReason) => void;
  applyAppSnapshot: (app: AppDetails) => void;
  /** Apply listing snapshot without pushing notifications (caller already notified). */
  applyAppSnapshotSilent: (app: AppDetails) => void;
  markAppUnpublishedLocal: (appId: string) => void;
  getTrackedApp: (appId: string) => TrackedApp | null;
  getTrackedAccount: (developerId: string) => TrackedAccount | null;
  rememberAccountListings: (developerId: string, listings: Record<string, AppListingMemory>) => void;
  rememberAccountCatalog: (developerId: string, apps: AppSummary[], name?: string) => void;
  archivePlayRemovedApp: (input: {
    appId: string;
    title: string;
    icon: string;
    developer: string;
    developerId?: string;
  }) => void;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stampUnpublished(memory: AppListingMemory | undefined, fallback: AppListingMemory): AppListingMemory {
  const base = memory ?? fallback;
  return {
    ...base,
    listingStatus: "unpublished",
    unpublishedAt:
      base.listingStatus === "unpublished" && base.unpublishedAt ? base.unpublishedAt : Date.now(),
  };
}

function clearLiveUnpublishedFlags(memory: Record<string, AppListingMemory>, liveIds: Iterable<string>) {
  for (const id of liveIds) {
    const row = memory[id];
    if (!row || row.listingStatus !== "unpublished") continue;
    const { listingStatus: _status, unpublishedAt: _at, ...rest } = row;
    memory[id] = rest;
  }
}

function memoryFromTracked(app: TrackedApp): AppListingMemory {
  const last = app.snapshots.at(-1);
  return {
    appId: app.appId,
    title: app.title,
    developer: app.developer,
    genre: app.genre ?? last?.genre ?? null,
    genreId: app.genreId ?? last?.genreId ?? null,
    version: last?.version ?? null,
    updated: last?.updated ?? null,
    description: last?.description ?? null,
    descriptionText: last?.descriptionText ?? null,
    screenshotsFp: last?.screenshotsFp ?? null,
    screenshotUrls: last?.screenshotUrls ?? null,
    icon: last?.icon || app.icon,
    headerImage: last?.headerImage ?? null,
    video: last?.video ?? null,
  };
}

/**
 * Only use a real deep baseline for alerts.
 * Thin catalog rows must seed memory silently — never invent screenshot/description changes.
 */
function resolveDeepBaseline(
  account: TrackedAccount,
  appId: string,
  watch: AccountWatch,
): AppListingMemory | undefined {
  const fromMemory = account.listingMemory?.[appId];
  if (hasDeepListingBaseline(fromMemory)) return fromMemory;
  const tracked = watch.getTrackedApp(appId);
  if (tracked) {
    const fromTracked = memoryFromTracked(tracked);
    if (hasDeepListingBaseline(fromTracked)) return fromTracked;
  }
  return undefined;
}

function resolveTitleHint(account: TrackedAccount, appId: string, watch: AccountWatch): AppListingMemory | undefined {
  if (account.listingMemory?.[appId]) return account.listingMemory[appId];
  const fromCatalog = account.catalog?.find((a) => a.appId === appId);
  if (fromCatalog) {
    return {
      appId: fromCatalog.appId,
      title: fromCatalog.title,
      icon: fromCatalog.icon || "",
      developer: fromCatalog.developer || account.name,
      genre: fromCatalog.genre ?? null,
      genreId: fromCatalog.genreId ?? null,
      version: null,
      updated: null,
      description: null,
      screenshotsFp: null,
    };
  }
  const tracked = watch.getTrackedApp(appId);
  if (tracked) return memoryFromTracked(tracked);
  return undefined;
}

export async function reloadAppCategory(
  qs: string,
  apps: TrackedApp[],
  watch: AppWatch,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<CategoryReloadResult> {
  const errors: string[] = [];
  let ok = 0;
  let removed = 0;
  let alerts = 0;
  const unreadBefore = unreadCount();
  const total = apps.length;
  for (let i = 0; i < apps.length; i += 1) {
    const app = apps[i];
    onProgress?.(i, total, app.title);
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(app.appId)}?${qs}`);
      const json = await res.json();
      if (res.ok && json.app) {
        watch.applyAppSnapshot(json.app as AppDetails);
        ok += 1;
      } else {
        const presence = await checkPlayPresence(qs, { appIds: [app.appId] });
        const status = presence.apps[0]?.status ?? "uncertain";
        if (status === "gone") {
          watch.markAppUnpublishedLocal(app.appId);
          removed += 1;
          alerts += 1;
        } else if (status === "live" && presence.apps[0]?.app) {
          watch.applyAppSnapshot(presence.apps[0].app);
          ok += 1;
        } else {
          errors.push(`${app.title}: ${json.error || presence.apps[0]?.error || "Play lookup flaky — skipped"}`);
        }
      }
    } catch (error) {
      try {
        const presence = await checkPlayPresence(qs, { appIds: [app.appId] });
        const status = presence.apps[0]?.status ?? "uncertain";
        if (status === "gone") {
          watch.markAppUnpublishedLocal(app.appId);
          removed += 1;
          alerts += 1;
        } else if (status === "live" && presence.apps[0]?.app) {
          watch.applyAppSnapshot(presence.apps[0].app);
          ok += 1;
        } else {
          errors.push(`${app.title}: ${error instanceof Error ? error.message : "failed"}`);
        }
      } catch {
        errors.push(`${app.title}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    if (i < apps.length - 1) await sleep(GAP_MS);
  }
  onProgress?.(total, total, "");
  alerts = Math.max(alerts, Math.max(0, unreadCount() - unreadBefore));
  return { ok, removed, appsChecked: 0, appsRemoved: 0, alerts, failed: errors.length, total, errors };
}

async function deepCheckAccountApps(
  qs: string,
  account: TrackedAccount,
  catalog: AppSummary[],
  watch: AccountWatch,
  options?: {
    silent?: boolean;
    onAppProgress?: (label: string) => void;
  },
): Promise<{ checked: number; removed: number; alerts: number; errors: string[] }> {
  const onAppProgress = options?.onAppProgress;
  const silent = Boolean(options?.silent);
  const errors: string[] = [];
  let checked = 0;
  let removed = 0;
  let alerts = 0;
  const prevIds = [
    ...new Set([
      ...(account.lastAppIds || []),
      ...(account.snapshots.at(-1)?.appIds || []),
      ...Object.keys(account.listingMemory || {}),
      ...(account.catalog || []).map((app) => app.appId),
    ]),
  ].filter(Boolean);
  const liveIds = new Set(catalog.map((app) => app.appId).filter(Boolean));
  const missing = prevIds.filter((id) => id && !liveIds.has(id));

  const targets = catalog.slice(0, ACCOUNT_APP_CAP);
  const nextMemory: Record<string, AppListingMemory> = { ...(account.listingMemory || {}) };
  const retainedFromOtherMarkets: AppSummary[] = [];

  if (!silent) {
    for (const summary of catalog) {
      if (!summary.appId) continue;
      const tracked = watch.getTrackedApp(summary.appId);
      const memory = nextMemory[summary.appId] ?? null;
      const marker = republishMarker(tracked, memory, null);
      if (marker == null) continue;
      alerts += pushNotifications([
        draftAppRepublished(
          {
            appId: summary.appId,
            title: summary.title || tracked?.title || memory?.title || summary.appId,
            icon: summary.icon || tracked?.icon || memory?.icon || null,
            developerId: summary.developerId || tracked?.developerId || account.developerId,
          },
          marker,
        ),
      ]);
    }
    clearLiveUnpublishedFlags(nextMemory, liveIds);
  }

  for (const appId of missing) {
    const memory = resolveTitleHint(account, appId, watch);
    try {
      onAppProgress?.(`Checking removed · ${memory?.title || appId}`);
      const presence = await checkPlayPresence(qs, { appIds: [appId] });
      const status = presence.apps[0]?.status ?? "uncertain";
      if (status === "gone") {
        if (!silent) {
          if (watch.getTrackedApp(appId)) {
            watch.markAppUnpublishedLocal(appId);
          } else {
            watch.archivePlayRemovedApp({
              appId,
              title: memory?.title || appId,
              icon: memory?.icon || "",
              developer: memory?.developer || account.name,
              developerId: account.developerId,
            });
          }
          removed += 1;
          alerts += 1;
          nextMemory[appId] = stampUnpublished(nextMemory[appId] || memory, {
            appId,
            title: memory?.title || appId,
            icon: memory?.icon || "",
            developer: memory?.developer || account.name,
          });
        }
      } else if (status === "live") {
        // Geo: missing from this storefront catalog but still listed elsewhere on Play.
        const liveApp = presence.apps[0]?.app;
        const tracked = watch.getTrackedApp(appId);
        if (liveApp && tracked) {
          if (silent) watch.applyAppSnapshotSilent(liveApp);
          else watch.applyAppSnapshot(liveApp);
        } else if (!silent) {
          const marker = republishMarker(null, nextMemory[appId] ?? memory ?? null, null);
          if (marker != null) {
            alerts += pushNotifications([
              draftAppRepublished(
                {
                  appId,
                  title: liveApp?.title || memory?.title || appId,
                  icon: liveApp?.icon || memory?.icon || null,
                  developerId: liveApp?.developerId || account.developerId,
                },
                marker,
              ),
            ]);
          }
        }
        const prevRow = account.catalog?.find((a) => a.appId === appId);
        retainedFromOtherMarkets.push({
          appId,
          title: liveApp?.title || memory?.title || prevRow?.title || appId,
          icon: liveApp?.icon || memory?.icon || prevRow?.icon || "",
          score: liveApp?.score ?? prevRow?.score ?? null,
          free: liveApp?.free ?? prevRow?.free ?? true,
          developer: liveApp?.developer || memory?.developer || account.name,
          developerId: liveApp?.developerId || account.developerId,
          genre: liveApp?.genre ?? memory?.genre ?? prevRow?.genre,
          genreId: liveApp?.genreId ?? memory?.genreId ?? prevRow?.genreId,
          installs: liveApp?.installs ?? prevRow?.installs,
          minInstalls: liveApp?.minInstalls ?? prevRow?.minInstalls,
          maxInstalls: liveApp?.maxInstalls ?? prevRow?.maxInstalls,
          released: liveApp?.released ?? prevRow?.released,
          url: liveApp?.url ?? prevRow?.url,
        });
        if (liveApp) nextMemory[appId] = listingMemoryFromApp(liveApp);
      }
      // uncertain → keep memory; do not treat as takedown
    } catch {
      errors.push(`${memory?.title || appId}: could not confirm Play removal`);
    }
    await sleep(GAP_MS);
  }

  for (let i = 0; i < targets.length; i += 1) {
    const summary = targets[i];
    if (!summary.appId) continue;
    onAppProgress?.(`${summary.title} (${i + 1}/${targets.length})`);
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(summary.appId)}?${qs}`);
      const json = await res.json();
      if (!res.ok || !json.app) {
        const presence = await checkPlayPresence(qs, { appIds: [summary.appId] });
        if (presence.apps[0]?.status === "gone") {
          if (!silent) {
            if (watch.getTrackedApp(summary.appId)) watch.markAppUnpublishedLocal(summary.appId);
            else {
              watch.archivePlayRemovedApp({
                appId: summary.appId,
                title: summary.title,
                icon: summary.icon,
                developer: summary.developer || account.name,
                developerId: account.developerId,
              });
            }
            removed += 1;
            alerts += 1;
            nextMemory[summary.appId] = stampUnpublished(nextMemory[summary.appId], {
              appId: summary.appId,
              title: summary.title,
              icon: summary.icon || "",
              developer: summary.developer || account.name,
            });
          }
        } else {
          errors.push(`${summary.title}: listing refresh failed`);
        }
        await sleep(GAP_MS);
        continue;
      }

      const live = json.app as AppDetails;
      const prev = resolveDeepBaseline(account, live.appId, watch);
      if (prev && !silent) {
        const drafts = diffListingMemory(prev, live);
        if (drafts.length) alerts += pushNotifications(drafts);
      }
      // No deep baseline yet / silent mode → seed quietly on first full listing fetch.

      if (watch.getTrackedApp(live.appId)) {
        watch.applyAppSnapshotSilent(live);
      }

      nextMemory[live.appId] = listingMemoryFromApp(live);
      checked += 1;
    } catch (error) {
      errors.push(`${summary.title}: ${error instanceof Error ? error.message : "failed"}`);
    }
    if (i < targets.length - 1) await sleep(GAP_MS);
  }

  // Only drop memory for apps confirmed gone (handled above). Keep geo-live apps.
  watch.rememberAccountListings(account.developerId, nextMemory);
  if (retainedFromOtherMarkets.length) {
    watch.rememberAccountCatalog(account.developerId, [...catalog, ...retainedFromOtherMarkets], account.name);
  }
  return { checked, removed, alerts, errors };
}

export async function reloadAccountCategory(
  qs: string,
  accounts: TrackedAccount[],
  watch: AccountWatch,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<CategoryReloadResult> {
  const errors: string[] = [];
  let ok = 0;
  let removed = 0;
  let appsChecked = 0;
  let appsRemoved = 0;
  let alerts = 0;
  const unreadBefore = unreadCount();
  const total = accounts.length;
  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i];
    onProgress?.(i, total, account.name);
    // Capture baseline BEFORE catalog overwrite so we can diff app changes.
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
      if (res.ok) {
        const apps = (json.apps || []) as AppSummary[];
        watch.applyAccountSnapshot({
          developerId: account.developerId,
          name: json.name || account.name,
          sampleIcon: apps[0]?.icon,
          apps,
        });
        ok += 1;
        const deep = await deepCheckAccountApps(qs, baselineFrozen, apps, watch, {
          onAppProgress: (label) => {
            onProgress?.(i, total, `${account.name} · ${label}`);
          },
        });
        appsChecked += deep.checked;
        appsRemoved += deep.removed;
        alerts += deep.alerts;
        errors.push(...deep.errors);
      } else {
        const presence = await checkPlayPresence(qs, { developerIds: [account.developerId] });
        const status = presence.accounts[0]?.status ?? "uncertain";
        if (status === "gone") {
          watch.untrackAccountLocal(account.developerId, "play-removed");
          removed += 1;
          alerts += 1;
        } else if (status === "live") {
          errors.push(`${account.name}: still on Play but catalog refresh failed`);
        } else {
          errors.push(`${account.name}: ${json.error || presence.accounts[0]?.error || "Play lookup flaky — skipped"}`);
        }
      }
    } catch (error) {
      try {
        const presence = await checkPlayPresence(qs, { developerIds: [account.developerId] });
        const status = presence.accounts[0]?.status ?? "uncertain";
        if (status === "gone") {
          watch.untrackAccountLocal(account.developerId, "play-removed");
          removed += 1;
          alerts += 1;
        } else {
          errors.push(`${account.name}: ${error instanceof Error ? error.message : "failed"}`);
        }
      } catch {
        errors.push(`${account.name}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    if (i < accounts.length - 1) await sleep(GAP_MS);
  }
  onProgress?.(total, total, "");
  alerts = Math.max(alerts, Math.max(0, unreadCount() - unreadBefore));
  return { ok, removed, appsChecked, appsRemoved, alerts, failed: errors.length, total, errors };
}

/** Used by Auto sync / Full sync after an account catalog is loaded. */
export async function deepSyncAccountCatalog(
  qs: string,
  account: TrackedAccount,
  catalog: AppSummary[],
  watch: AccountWatch,
  options?: {
    silent?: boolean;
    onAppProgress?: (label: string) => void;
  },
) {
  return deepCheckAccountApps(qs, account, catalog, watch, options);
}
