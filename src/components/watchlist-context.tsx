"use client";

import type {
  AccountTrackCategory,
  AppDetails,
  AppListingMemory,
  AppSummary,
  AppTrackCategory,
  RemovedAccount,
  RemovedApp,
  RemovedReason,
  StoreData,
  Storefront,
  TrackedAccount,
  TrackedApp,
  TrackedKeyword,
  KeywordRank,
} from "@/lib/playstore/types";
import { diffAccount, diffApp, draftAccountRemoved, draftAppRemoved, draftAppRepublished, draftAppUnpublished, republishMarker } from "@/lib/notifications/diff";
import { pushNotifications } from "@/lib/notifications/store";
import { reconcileStore } from "@/lib/store/reconcile";
import { snapshotFromAccount, snapshotFromApp, snapshotFromKeyword, catalogFromApps, mergeAccountCatalog, unionAppIds, asContentFingerprint, asScreenshotsFingerprint } from "@/lib/store/snapshots";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const KEY = "track-dashboard-watchlist-v1";
const LAST_CATEGORY_KEY = "track-dashboard-last-category-v1";
const MAX_SNAPSHOTS = 40;

type LastCategories = {
  appCategoryId: string | null;
  accountCategoryId: string | null;
};

const emptyLast: LastCategories = { appCategoryId: null, accountCategoryId: null };

function readLastCategories(): LastCategories {
  try {
    const raw = localStorage.getItem(LAST_CATEGORY_KEY);
    if (!raw) return { ...emptyLast };
    const parsed = JSON.parse(raw) as LastCategories;
    return {
      appCategoryId: parsed.appCategoryId ?? null,
      accountCategoryId: parsed.accountCategoryId ?? null,
    };
  } catch {
    return { ...emptyLast };
  }
}

function writeLastCategories(next: LastCategories) {
  try {
    localStorage.setItem(LAST_CATEGORY_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

function compactListingMemory(memory: TrackedAccount["listingMemory"]): TrackedAccount["listingMemory"] {
  if (!memory) return memory;
  const next: NonNullable<TrackedAccount["listingMemory"]> = {};
  for (const [appId, row] of Object.entries(memory)) {
    if (!row) continue;
    next[appId] = {
      ...row,
      description: asContentFingerprint(row.description),
      descriptionText: row.descriptionText ? String(row.descriptionText).slice(0, 4000) : null,
      screenshotsFp: asScreenshotsFingerprint(row.screenshotsFp),
      screenshotUrls: row.screenshotUrls?.length ? row.screenshotUrls.filter(Boolean).slice(0, 4) : null,
      headerImage: row.headerImage || null,
      video: row.video || null,
    };
  }
  return next;
}

function compactStore(data: StoreData): StoreData {
  return {
    ...data,
    apps: data.apps.map((app) => ({
      ...app,
      snapshots: app.snapshots.slice(-MAX_SNAPSHOTS).map((snap, index, arr) => {
        const keepText = index >= arr.length - 2;
        return {
          ...snap,
          description: asContentFingerprint(snap.description),
          descriptionText: keepText && snap.descriptionText ? String(snap.descriptionText).slice(0, 4000) : null,
          screenshotsFp: asScreenshotsFingerprint(snap.screenshotsFp),
          screenshotUrls: keepText && snap.screenshotUrls?.length
            ? snap.screenshotUrls.filter(Boolean).slice(0, 4)
            : null,
          icon: keepText ? snap.icon || null : null,
          headerImage: keepText ? snap.headerImage || null : null,
          video: keepText ? snap.video || null : null,
          recentChanges: snap.recentChanges ? String(snap.recentChanges).slice(0, 500) : snap.recentChanges,
        };
      }),
    })),
    accounts: data.accounts.map((account) => ({
      ...account,
      snapshots: account.snapshots.slice(-MAX_SNAPSHOTS),
      listingMemory: compactListingMemory(account.listingMemory),
    })),
    keywords: data.keywords.map((keyword) => ({
      ...keyword,
      snapshots: keyword.snapshots.slice(-MAX_SNAPSHOTS),
    })),
  };
}

function persistWatchlist(data: StoreData) {
  const compact = compactStore(data);
  const payload = JSON.stringify(compact);
  try {
    localStorage.setItem(KEY, payload);
    return compact;
  } catch {
    // Last-resort trim: drop listing memory and older snapshots.
    const trimmed: StoreData = {
      ...compact,
      apps: compact.apps.map((app) => ({ ...app, snapshots: app.snapshots.slice(-8) })),
      accounts: compact.accounts.map((account) => ({
        ...account,
        snapshots: account.snapshots.slice(-8),
        listingMemory: undefined,
      })),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch {
      /* give up quietly — UI stays usable */
    }
    return trimmed;
  }
}

function liveCategoryId(categories: { id: string }[], id: string | null) {
  if (!id) return null;
  return categories.some((c) => c.id === id) ? id : null;
}

const empty: StoreData = {
  apps: [],
  accounts: [],
  categories: [],
  accountCategories: [],
  removedApps: [],
  removedAccounts: [],
  keywords: [],
};

function asTrackedApp(item: RemovedApp): TrackedApp {
  const { removedAt: _r, reason: _e, playStatus: _p, ...app } = item;
  return { ...app, listingStatus: "live", unpublishedAt: null };
}

function asTrackedAccount(item: RemovedAccount): TrackedAccount {
  const { removedAt: _r, reason: _e, playStatus: _p, ...account } = item;
  return account;
}

function dropRemoteWatchlist(type: "app" | "account", id: string) {
  fetch(`/api/watchlist?type=${type}&id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
}

function normalize(parsed: Partial<StoreData> | null | undefined): StoreData {
  return compactStore(
    reconcileStore({
      apps: (parsed?.apps ?? []).map((app) => ({
        ...app,
        categoryId: app.categoryId ?? null,
        genre: app.genre ?? null,
        genreId: app.genreId ?? null,
      })),
      accounts: (parsed?.accounts ?? []).map((acc) => ({ ...acc, categoryId: acc.categoryId ?? null })),
      categories: parsed?.categories ?? [],
      accountCategories: parsed?.accountCategories ?? [],
      removedApps: parsed?.removedApps ?? [],
      removedAccounts: parsed?.removedAccounts ?? [],
      keywords: parsed?.keywords ?? [],
    }),
  );
}

function readLocal(): StoreData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...empty };
    return normalize(JSON.parse(raw) as StoreData);
  } catch {
    return { ...empty };
  }
}

function merge(a: StoreData, b: StoreData): StoreData {
  const local = reconcileStore(a);
  const remote = reconcileStore(b);
  const localRemovedApps = new Set(local.removedApps.map((app) => app.appId));
  const localRemovedAccounts = new Set(local.removedAccounts.map((acc) => acc.developerId));
  const localTrackedApps = new Set(local.apps.map((app) => app.appId));
  const localTrackedAccounts = new Set(local.accounts.map((acc) => acc.developerId));

  const apps = [...local.apps];
  for (const app of remote.apps) {
    if (localRemovedApps.has(app.appId)) continue;
    if (!apps.some((x) => x.appId === app.appId)) apps.push({ ...app, categoryId: app.categoryId ?? null });
  }
  const accounts = [...local.accounts];
  for (const acc of remote.accounts) {
    if (localRemovedAccounts.has(acc.developerId)) continue;
    const index = accounts.findIndex((x) => x.developerId === acc.developerId);
    if (index < 0) {
      accounts.push({ ...acc, categoryId: acc.categoryId ?? null });
      continue;
    }
    const localCat = accounts[index].catalog ?? [];
    const remoteCat = acc.catalog ?? [];
    const catalog = mergeAccountCatalog(
      localCat.length >= remoteCat.length ? remoteCat : localCat,
      localCat.length >= remoteCat.length ? localCat : remoteCat,
    );
    accounts[index] = {
      ...acc,
      ...accounts[index],
      categoryId: accounts[index].categoryId ?? acc.categoryId ?? null,
      catalog,
      lastAppIds: accounts[index].lastAppIds?.length ? accounts[index].lastAppIds : acc.lastAppIds,
      appCount: Math.max(accounts[index].appCount ?? 0, acc.appCount ?? 0, catalog.length),
    };
  }
  const categories = [...local.categories];
  for (const cat of remote.categories) {
    if (!categories.some((x) => x.id === cat.id)) categories.push(cat);
  }
  const accountCategories = [...local.accountCategories];
  for (const cat of remote.accountCategories) {
    if (!accountCategories.some((x) => x.id === cat.id)) accountCategories.push(cat);
  }
  const localIsEmpty =
    local.apps.length === 0 &&
    local.accounts.length === 0 &&
    local.removedApps.length === 0 &&
    local.removedAccounts.length === 0 &&
    local.categories.length === 0 &&
    local.accountCategories.length === 0 &&
    local.keywords.length === 0;
  const removedApps = localIsEmpty
    ? [...remote.removedApps]
    : local.removedApps.filter((app) => !localTrackedApps.has(app.appId));
  const removedAccounts = localIsEmpty
    ? [...remote.removedAccounts]
    : local.removedAccounts.filter((acc) => !localTrackedAccounts.has(acc.developerId));
  const keywords = [...local.keywords];
  for (const kw of remote.keywords) {
    if (!keywords.some((x) => x.term === kw.term)) keywords.push(kw);
  }
  return reconcileStore({ apps, accounts, categories, accountCategories, removedApps, removedAccounts, keywords });
}

function normalizeTerm(term: string) {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

function newId() {
  return crypto.randomUUID();
}

function clearRepublishedMemory(
  memory: Record<string, AppListingMemory> | undefined,
  liveIds: Set<string>,
): Record<string, AppListingMemory> | undefined {
  if (!memory) return memory;
  let changed = false;
  const next: Record<string, AppListingMemory> = { ...memory };
  for (const id of liveIds) {
    const row = next[id];
    if (!row || row.listingStatus !== "unpublished") continue;
    const { listingStatus: _status, unpublishedAt: _at, ...rest } = row;
    next[id] = rest;
    changed = true;
  }
  return changed ? next : memory;
}

type WatchlistApi = {
  ready: boolean;
  data: StoreData;
  getTrackedApp: (appId: string) => TrackedApp | null;
  getTrackedAccount: (developerId: string) => TrackedAccount | null;
  getCategory: (id: string) => AppTrackCategory | null;
  getAccountCategory: (id: string) => AccountTrackCategory | null;
  lastAppCategoryId: string | null;
  lastAccountCategoryId: string | null;
  rememberAppCategory: (categoryId: string | null) => void;
  rememberAccountCategory: (categoryId: string | null) => void;
  trackAppLocal: (app: AppDetails, categoryId?: string | null) => TrackedApp;
  untrackAppLocal: (appId: string, reason?: RemovedReason) => void;
  /** Play-gone: keep on App Tracking and mark unpublished (do not move to Remove App). */
  markAppUnpublishedLocal: (appId: string) => void;
  restoreRemovedApp: (appId: string) => void;
  deleteRemovedApp: (appId: string) => void;
  clearRemovedApps: () => void;
  setRemovedAppPlayStatus: (appId: string, playStatus: RemovedApp["playStatus"]) => void;
  setAppCategory: (appId: string, categoryId: string | null) => void;
  createCategory: (name: string) => AppTrackCategory | null;
  updateCategory: (id: string, name: string) => boolean;
  deleteCategory: (id: string) => void;
  trackAccountLocal: (input: {
    developerId: string;
    name: string;
    sampleIcon?: string;
    apps: AppSummary[];
    categoryId?: string | null;
  }) => TrackedAccount;
  untrackAccountLocal: (developerId: string, reason?: RemovedReason) => void;
  restoreRemovedAccount: (developerId: string) => void;
  deleteRemovedAccount: (developerId: string) => void;
  clearRemovedAccounts: () => void;
  setRemovedAccountPlayStatus: (developerId: string, playStatus: RemovedAccount["playStatus"]) => void;
  setAccountCategory: (developerId: string, categoryId: string | null) => void;
  createAccountCategory: (name: string) => AccountTrackCategory | null;
  updateAccountCategory: (id: string, name: string) => boolean;
  deleteAccountCategory: (id: string) => void;
  rememberAccountCatalog: (developerId: string, apps: AppSummary[], name?: string) => void;
  rememberAccountListings: (developerId: string, listings: Record<string, AppListingMemory>) => void;
  archivePlayRemovedApp: (input: {
    appId: string;
    title: string;
    icon: string;
    developer: string;
    developerId?: string;
  }) => void;
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
  getKeyword: (term: string) => TrackedKeyword | null;
  trackKeywordLocal: (term: string, ranks: KeywordRank[], store: Storefront) => TrackedKeyword;
  untrackKeywordLocal: (term: string) => void;
  applyKeywordSnapshot: (term: string, ranks: KeywordRank[], store: Storefront) => void;
  browserCacheSummary: () => { apps: number; accounts: number; categories: number };
  restoreBrowserCacheToServer: () => Promise<{ ok: boolean; message: string }>;
  importStoreToServer: (store: StoreData) => Promise<{ ok: boolean; message: string }>;
};

const Ctx = createContext<WatchlistApi | null>(null);

function storeHasRows(store: StoreData) {
  return Boolean(
    store.apps.length ||
      store.accounts.length ||
      store.categories.length ||
      store.accountCategories.length ||
      store.removedApps.length ||
      store.removedAccounts.length ||
      store.keywords.length,
  );
}

function pushStoreToServer(store: StoreData) {
  fetch("/api/store", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store }),
  }).catch(() => undefined);
}

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<StoreData>(empty);
  const [ready, setReady] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [lastCats, setLastCats] = useState<LastCategories>(emptyLast);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const local = readLocal();
      setData(local);
      setLastCats(readLastCategories());
      setReady(true);
      try {
        const res = await fetch("/api/store");
        const json = (await res.json()) as { store?: StoreData };
        if (cancelled) return;
        const remote = normalize(json.store);
        if (!storeHasRows(remote) && storeHasRows(local)) {
          const mig = await fetch("/api/store/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ store: local }),
          });
          const migJson = (await mig.json()) as { store?: StoreData };
          if (cancelled) return;
          const next = normalize(migJson.store || remote);
          persistWatchlist(next);
          setData(next);
        } else if (storeHasRows(remote)) {
          const next = storeHasRows(local) ? merge(local, remote) : remote;
          // Prefer richer snapshot history from server when both exist.
          const mergedApps = next.apps.map((app) => {
            const remoteApp = remote.apps.find((a) => a.appId === app.appId);
            if (!remoteApp) return app;
            const byTs = new Map<number, (typeof app.snapshots)[number]>();
            for (const snap of [...remoteApp.snapshots, ...app.snapshots]) byTs.set(snap.ts, snap);
            return {
              ...app,
              ...remoteApp,
              categoryId: app.categoryId ?? remoteApp.categoryId ?? null,
              snapshots: [...byTs.values()].sort((a, b) => a.ts - b.ts),
            };
          });
          const withHistory = { ...next, apps: mergedApps };
          persistWatchlist(withHistory);
          setData(withHistory);
          pushStoreToServer(withHistory);
        } else {
          persistWatchlist(local);
        }
      } catch {
        /* keep local cache */
      } finally {
        if (!cancelled) setServerReady(true);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    persistWatchlist(data);
  }, [data, ready]);

  useEffect(() => {
    if (!ready || !serverReady) return;
    if (!storeHasRows(data)) return;
    const timer = window.setTimeout(() => pushStoreToServer(data), 1000);
    return () => window.clearTimeout(timer);
  }, [data, ready, serverReady]);

  const api = useMemo<WatchlistApi>(
    () => ({
      ready,
      data,
      getTrackedApp: (appId) => data.apps.find((a) => a.appId === appId) ?? null,
      getTrackedAccount: (developerId) =>
        data.accounts.find((a) => a.developerId === developerId) ?? null,
      getCategory: (id) => data.categories.find((c) => c.id === id) ?? null,
      getAccountCategory: (id) => data.accountCategories.find((c) => c.id === id) ?? null,
      lastAppCategoryId: liveCategoryId(data.categories, lastCats.appCategoryId),
      lastAccountCategoryId: liveCategoryId(data.accountCategories, lastCats.accountCategoryId),
      rememberAppCategory: (categoryId) => {
        setLastCats((prev) => {
          const next = { ...prev, appCategoryId: categoryId };
          writeLastCategories(next);
          return next;
        });
      },
      rememberAccountCategory: (categoryId) => {
        setLastCats((prev) => {
          const next = { ...prev, accountCategoryId: categoryId };
          writeLastCategories(next);
          return next;
        });
      },
      trackAppLocal: (app, categoryId) => {
        const lastId = liveCategoryId(data.categories, lastCats.appCategoryId);
        const resolved = categoryId !== undefined ? categoryId : lastId;
        if (categoryId !== undefined) {
          setLastCats((prev) => {
            const next = { ...prev, appCategoryId: categoryId };
            writeLastCategories(next);
            return next;
          });
        }
        const snap = snapshotFromApp(app);
        let next: TrackedApp;
        setData((prev) => {
          const resurrected = prev.removedApps.find((a) => a.appId === app.appId);
          const existing = prev.apps.find((a) => a.appId === app.appId) ?? (resurrected ? asTrackedApp(resurrected) : null);
          next = existing
            ? {
                ...existing,
                title: app.title,
                icon: app.icon,
                developer: app.developer,
                developerId: app.developerId,
                genre: app.genre ?? existing.genre ?? null,
                genreId: app.genreId ?? existing.genreId ?? null,
                categoryId: categoryId === undefined ? existing.categoryId ?? null : categoryId,
                listingStatus: "live",
                unpublishedAt: null,
                snapshots: [...existing.snapshots, snap].slice(-MAX_SNAPSHOTS),
              }
            : {
                appId: app.appId,
                title: app.title,
                icon: app.icon,
                developer: app.developer,
                developerId: app.developerId,
                genre: app.genre ?? null,
                genreId: app.genreId ?? null,
                addedAt: Date.now(),
                categoryId: resolved,
                listingStatus: "live",
                unpublishedAt: null,
                snapshots: [snap],
              };
          const apps = prev.apps.some((a) => a.appId === app.appId)
            ? prev.apps.map((a) => (a.appId === app.appId ? next : a))
            : [next, ...prev.apps];
          return { ...prev, apps, removedApps: prev.removedApps.filter((a) => a.appId !== app.appId) };
        });
        return next!;
      },
      untrackAppLocal: (appId, reason = "untracked") => {
        dropRemoteWatchlist("app", appId);
        const app = data.apps.find((a) => a.appId === appId);
        if (app) pushNotifications([draftAppRemoved(app, reason)]);
        setData((prev) => {
          const current = prev.apps.find((a) => a.appId === appId);
          if (!current) return prev;
          const removed: RemovedApp = {
            ...current,
            removedAt: Date.now(),
            reason,
            playStatus: reason === "play-removed" ? "gone" : "unknown",
          };
          return {
            ...prev,
            apps: prev.apps.filter((a) => a.appId !== appId),
            removedApps: [removed, ...prev.removedApps.filter((a) => a.appId !== appId)],
          };
        });
      },
      markAppUnpublishedLocal: (appId) => {
        const app = data.apps.find((a) => a.appId === appId);
        if (!app) return;
        if (app.listingStatus === "unpublished") return;
        pushNotifications([draftAppUnpublished(app)]);
        setData((prev) => ({
          ...prev,
          apps: prev.apps.map((a) =>
            a.appId === appId
              ? { ...a, listingStatus: "unpublished", unpublishedAt: Date.now() }
              : a,
          ),
        }));
      },
      restoreRemovedApp: (appId) => {
        setData((prev) => {
          const item = prev.removedApps.find((a) => a.appId === appId);
          if (!item) return prev;
          const tracked = asTrackedApp(item);
          if (prev.apps.some((a) => a.appId === appId)) {
            return { ...prev, removedApps: prev.removedApps.filter((a) => a.appId !== appId) };
          }
          return {
            ...prev,
            apps: [tracked, ...prev.apps],
            removedApps: prev.removedApps.filter((a) => a.appId !== appId),
          };
        });
      },
      deleteRemovedApp: (appId) => {
        setData((prev) => ({ ...prev, removedApps: prev.removedApps.filter((a) => a.appId !== appId) }));
      },
      clearRemovedApps: () => {
        fetch("/api/watchlist?type=removed-apps", { method: "DELETE" }).catch(() => undefined);
        setData((prev) => ({ ...prev, removedApps: [] }));
      },
      setRemovedAppPlayStatus: (appId, playStatus) => {
        setData((prev) => ({
          ...prev,
          removedApps: prev.removedApps.map((a) =>
            a.appId === appId
              ? { ...a, playStatus, reason: playStatus === "gone" ? "play-removed" : a.reason }
              : a,
          ),
        }));
      },
      setAppCategory: (appId, categoryId) => {
        setLastCats((prev) => {
          const next = { ...prev, appCategoryId: categoryId };
          writeLastCategories(next);
          return next;
        });
        setData((prev) => ({
          ...prev,
          apps: prev.apps.map((a) => (a.appId === appId ? { ...a, categoryId } : a)),
        }));
      },
      createCategory: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const exists = data.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) return data.categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase()) ?? null;
        const category: AppTrackCategory = { id: newId(), name: trimmed, createdAt: Date.now() };
        setData((prev) => ({ ...prev, categories: [...prev.categories, category] }));
        return category;
      },
      updateCategory: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const clash = data.categories.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase());
        if (clash) return false;
        setData((prev) => ({
          ...prev,
          categories: prev.categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
        }));
        return true;
      },
      deleteCategory: (id) => {
        setLastCats((prev) => {
          if (prev.appCategoryId !== id) return prev;
          const next = { ...prev, appCategoryId: null };
          writeLastCategories(next);
          return next;
        });
        setData((prev) => ({
          ...prev,
          categories: prev.categories.filter((c) => c.id !== id),
          apps: prev.apps.map((a) => (a.categoryId === id ? { ...a, categoryId: null } : a)),
        }));
      },
      trackAccountLocal: (input) => {
        const lastId = liveCategoryId(data.accountCategories, lastCats.accountCategoryId);
        const resolved = input.categoryId !== undefined ? input.categoryId : lastId;
        if (input.categoryId !== undefined) {
          setLastCats((prev) => {
            const next = { ...prev, accountCategoryId: input.categoryId ?? null };
            writeLastCategories(next);
            return next;
          });
        }
        const snap = snapshotFromAccount(input.apps, input.name);
        let next: TrackedAccount;
        setData((prev) => {
          const resurrected = prev.removedAccounts.find((a) => a.developerId === input.developerId);
          const existing =
            prev.accounts.find((a) => a.developerId === input.developerId) ??
            (resurrected ? asTrackedAccount(resurrected) : null);
          const lastAppIds = input.apps.map((a) => a.appId);
          const catalog = catalogFromApps(input.apps);
          next = existing
            ? {
                ...existing,
                name: input.name,
                sampleIcon: input.sampleIcon ?? existing.sampleIcon,
                appCount: input.apps.length,
                lastAppIds,
                catalog,
                categoryId: input.categoryId === undefined ? existing.categoryId ?? null : input.categoryId,
                snapshots: [...existing.snapshots, snap].slice(-MAX_SNAPSHOTS),
              }
            : {
                developerId: input.developerId,
                name: input.name,
                addedAt: Date.now(),
                sampleIcon: input.sampleIcon,
                appCount: input.apps.length,
                lastAppIds,
                catalog,
                categoryId: resolved,
                snapshots: [snap],
              };
          const accounts = prev.accounts.some((a) => a.developerId === input.developerId)
            ? prev.accounts.map((a) => (a.developerId === input.developerId ? next : a))
            : [next, ...prev.accounts];
          return {
            ...prev,
            accounts,
            removedAccounts: prev.removedAccounts.filter((a) => a.developerId !== input.developerId),
          };
        });
        return next!;
      },
      untrackAccountLocal: (developerId, reason = "untracked") => {
        dropRemoteWatchlist("account", developerId);
        const account = data.accounts.find((a) => a.developerId === developerId);
        if (account) pushNotifications([draftAccountRemoved(account, reason)]);
        setData((prev) => {
          const current = prev.accounts.find((a) => a.developerId === developerId);
          if (!current) return prev;
          const removed: RemovedAccount = {
            ...current,
            removedAt: Date.now(),
            reason,
            playStatus: reason === "play-removed" ? "gone" : "unknown",
          };
          return {
            ...prev,
            accounts: prev.accounts.filter((a) => a.developerId !== developerId),
            removedAccounts: [removed, ...prev.removedAccounts.filter((a) => a.developerId !== developerId)],
          };
        });
      },
      restoreRemovedAccount: (developerId) => {
        setData((prev) => {
          const item = prev.removedAccounts.find((a) => a.developerId === developerId);
          if (!item) return prev;
          const tracked = asTrackedAccount(item);
          if (prev.accounts.some((a) => a.developerId === developerId)) {
            return { ...prev, removedAccounts: prev.removedAccounts.filter((a) => a.developerId !== developerId) };
          }
          return {
            ...prev,
            accounts: [tracked, ...prev.accounts],
            removedAccounts: prev.removedAccounts.filter((a) => a.developerId !== developerId),
          };
        });
      },
      deleteRemovedAccount: (developerId) => {
        setData((prev) => ({
          ...prev,
          removedAccounts: prev.removedAccounts.filter((a) => a.developerId !== developerId),
        }));
      },
      clearRemovedAccounts: () => {
        fetch("/api/watchlist?type=removed-accounts", { method: "DELETE" }).catch(() => undefined);
        setData((prev) => ({ ...prev, removedAccounts: [] }));
      },
      setRemovedAccountPlayStatus: (developerId, playStatus) => {
        setData((prev) => ({
          ...prev,
          removedAccounts: prev.removedAccounts.map((a) =>
            a.developerId === developerId
              ? { ...a, playStatus, reason: playStatus === "gone" ? "play-removed" : a.reason }
              : a,
          ),
        }));
      },
      setAccountCategory: (developerId, categoryId) => {
        setLastCats((prev) => {
          const next = { ...prev, accountCategoryId: categoryId };
          writeLastCategories(next);
          return next;
        });
        setData((prev) => ({
          ...prev,
          accounts: prev.accounts.map((a) => (a.developerId === developerId ? { ...a, categoryId } : a)),
        }));
      },
      createAccountCategory: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const exists = data.accountCategories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) return exists;
        const category: AccountTrackCategory = { id: newId(), name: trimmed, createdAt: Date.now() };
        setData((prev) => ({ ...prev, accountCategories: [...prev.accountCategories, category] }));
        return category;
      },
      updateAccountCategory: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const clash = data.accountCategories.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase());
        if (clash) return false;
        setData((prev) => ({
          ...prev,
          accountCategories: prev.accountCategories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
        }));
        return true;
      },
      deleteAccountCategory: (id) => {
        setLastCats((prev) => {
          if (prev.accountCategoryId !== id) return prev;
          const next = { ...prev, accountCategoryId: null };
          writeLastCategories(next);
          return next;
        });
        setData((prev) => ({
          ...prev,
          accountCategories: prev.accountCategories.filter((c) => c.id !== id),
          accounts: prev.accounts.map((a) => (a.categoryId === id ? { ...a, categoryId: null } : a)),
        }));
      },
      applyAppSnapshot: (app) => {
        const existing = data.apps.find((a) => a.appId === app.appId);
        if (existing) {
          const drafts = diffApp(existing, app);
          if (existing.listingStatus === "unpublished") {
            drafts.unshift(
              draftAppRepublished(
                {
                  appId: existing.appId,
                  title: app.title || existing.title,
                  icon: app.icon || existing.icon,
                  developerId: app.developerId || existing.developerId,
                },
                republishMarker(existing, null, null),
              ),
            );
          }
          if (drafts.length) pushNotifications(drafts);
        }
        const snap = snapshotFromApp(app);
        setData((prev) => ({
          ...prev,
          apps: prev.apps.map((a) =>
            a.appId === app.appId
              ? {
                  ...a,
                  title: app.title,
                  icon: app.icon,
                  developer: app.developer,
                  developerId: app.developerId ?? a.developerId,
                  genre: app.genre ?? a.genre ?? null,
                  genreId: app.genreId ?? a.genreId ?? null,
                  listingStatus: "live",
                  unpublishedAt: null,
                  snapshots: [...a.snapshots, snap].slice(-MAX_SNAPSHOTS),
                }
              : a,
          ),
        }));
      },
      applyAppSnapshotSilent: (app) => {
        const snap = snapshotFromApp(app);
        setData((prev) => ({
          ...prev,
          apps: prev.apps.map((a) =>
            a.appId === app.appId
              ? {
                  ...a,
                  title: app.title,
                  icon: app.icon,
                  developer: app.developer,
                  developerId: app.developerId ?? a.developerId,
                  genre: app.genre ?? a.genre ?? null,
                  genreId: app.genreId ?? a.genreId ?? null,
                  listingStatus: "live",
                  unpublishedAt: null,
                  snapshots: [...a.snapshots, snap].slice(-MAX_SNAPSHOTS),
                }
              : a,
          ),
        }));
      },
      rememberAccountCatalog: (developerId, apps, name) => {
        setData((prev) => ({
          ...prev,
          accounts: prev.accounts.map((a) =>
            a.developerId === developerId
              ? {
                  ...a,
                  name: name || a.name,
                  sampleIcon: apps[0]?.icon ?? a.sampleIcon,
                  catalog: mergeAccountCatalog(a.catalog, apps),
                  lastAppIds: unionAppIds(a.lastAppIds, a.catalog?.map((app) => app.appId), apps.map((app) => app.appId)),
                  appCount: mergeAccountCatalog(a.catalog, apps).length,
                }
              : a,
          ),
        }));
      },
      rememberAccountListings: (developerId, listings) => {
        setData((prev) => ({
          ...prev,
          accounts: prev.accounts.map((a) =>
            a.developerId === developerId ? { ...a, listingMemory: listings } : a,
          ),
        }));
      },
      archivePlayRemovedApp: (input) => {
        const existingTracked = data.apps.find((a) => a.appId === input.appId);
        if (existingTracked) {
          // Tracked apps stay on App Tracking as unpublished — never move to Remove App.
          if (existingTracked.listingStatus !== "unpublished") {
            pushNotifications([draftAppUnpublished(existingTracked)]);
            setData((prev) => ({
              ...prev,
              apps: prev.apps.map((a) =>
                a.appId === input.appId
                  ? { ...a, listingStatus: "unpublished", unpublishedAt: Date.now() }
                  : a,
              ),
            }));
          }
          return;
        }
        if (data.removedApps.some((a) => a.appId === input.appId)) return;
        const tracked: TrackedApp = {
          appId: input.appId,
          title: input.title,
          icon: input.icon,
          developer: input.developer,
          developerId: input.developerId,
          addedAt: Date.now(),
          snapshots: [],
        };
        pushNotifications([draftAppRemoved(tracked, "play-removed")]);
        setData((prev) => ({
          ...prev,
          removedApps: [
            {
              ...tracked,
              removedAt: Date.now(),
              reason: "play-removed" as const,
              playStatus: "gone" as const,
            },
            ...prev.removedApps.filter((a) => a.appId !== input.appId),
          ],
        }));
      },
      applyAccountSnapshot: (input) => {
        const existing = data.accounts.find((a) => a.developerId === input.developerId);
        const drafts = existing ? diffAccount(existing, { name: input.name, apps: input.apps }) : [];
        const liveIds = new Set(input.apps.map((app) => app.appId).filter(Boolean));
        const reviveTracked = new Set<string>();
        const reviveRemoved = new Set<string>();
        for (const app of input.apps) {
          if (!app.appId) continue;
          const tracked = data.apps.find((row) => row.appId === app.appId) ?? null;
          const removed = data.removedApps.find((row) => row.appId === app.appId) ?? null;
          const memory = existing?.listingMemory?.[app.appId] ?? null;
          const marker = republishMarker(tracked, memory, removed);
          if (marker == null) continue;
          drafts.push(
            draftAppRepublished(
              {
                appId: app.appId,
                title: app.title || tracked?.title || memory?.title || removed?.title || app.appId,
                icon: app.icon || tracked?.icon || memory?.icon || removed?.icon,
                developerId: app.developerId || tracked?.developerId || removed?.developerId || input.developerId,
              },
              marker,
            ),
          );
          if (tracked?.listingStatus === "unpublished") reviveTracked.add(app.appId);
          if (
            removed &&
            removed.playStatus !== "live" &&
            (removed.reason === "play-removed" || removed.playStatus === "gone")
          ) {
            reviveRemoved.add(app.appId);
          }
        }
        if (drafts.length) pushNotifications(drafts);
        const snap = snapshotFromAccount(input.apps, input.name);
        setData((prev) => ({
          ...prev,
          apps: reviveTracked.size
            ? prev.apps.map((row) =>
                reviveTracked.has(row.appId) ? { ...row, listingStatus: "live", unpublishedAt: null } : row,
              )
            : prev.apps,
          removedApps: reviveRemoved.size
            ? prev.removedApps.map((row) => (reviveRemoved.has(row.appId) ? { ...row, playStatus: "live" } : row))
            : prev.removedApps,
          accounts: prev.accounts.map((a) => {
            if (a.developerId !== input.developerId) return a;
            const catalog = mergeAccountCatalog(a.catalog, input.apps);
            return {
              ...a,
              name: input.name,
              sampleIcon: input.sampleIcon ?? a.sampleIcon,
              appCount: catalog.length,
              lastAppIds: unionAppIds(a.lastAppIds, a.catalog?.map((app) => app.appId), input.apps.map((app) => app.appId)),
              catalog,
              listingMemory: clearRepublishedMemory(a.listingMemory, liveIds),
              snapshots: [...a.snapshots, snap].slice(-MAX_SNAPSHOTS),
            };
          }),
        }));
      },
      applyAccountSnapshotSilent: (input) => {
        const snap = snapshotFromAccount(input.apps, input.name);
        setData((prev) => ({
          ...prev,
          accounts: prev.accounts.map((a) => {
            if (a.developerId !== input.developerId) return a;
            const catalog = mergeAccountCatalog(a.catalog, input.apps);
            return {
              ...a,
              name: input.name,
              sampleIcon: input.sampleIcon ?? a.sampleIcon,
              appCount: catalog.length,
              lastAppIds: unionAppIds(a.lastAppIds, a.catalog?.map((app) => app.appId), input.apps.map((app) => app.appId)),
              catalog,
              snapshots: [...a.snapshots, snap].slice(-MAX_SNAPSHOTS),
            };
          }),
        }));
      },
      getKeyword: (term) => data.keywords.find((k) => k.term === normalizeTerm(term)) ?? null,
      trackKeywordLocal: (term, ranks, store) => {
        const key = normalizeTerm(term);
        const snap = snapshotFromKeyword(ranks, store);
        let next: TrackedKeyword;
        setData((prev) => {
          const existing = prev.keywords.find((k) => k.term === key);
          next = existing
            ? { ...existing, snapshots: [...existing.snapshots, snap].slice(-MAX_SNAPSHOTS) }
            : { term: key, addedAt: Date.now(), snapshots: [snap] };
          const keywords = existing
            ? prev.keywords.map((k) => (k.term === key ? next : k))
            : [next, ...prev.keywords];
          return { ...prev, keywords };
        });
        return next!;
      },
      untrackKeywordLocal: (term) => {
        const key = normalizeTerm(term);
        setData((prev) => ({ ...prev, keywords: prev.keywords.filter((k) => k.term !== key) }));
      },
      applyKeywordSnapshot: (term, ranks, store) => {
        const key = normalizeTerm(term);
        const snap = snapshotFromKeyword(ranks, store);
        setData((prev) => ({
          ...prev,
          keywords: prev.keywords.map((k) =>
            k.term === key ? { ...k, snapshots: [...k.snapshots, snap].slice(-MAX_SNAPSHOTS) } : k,
          ),
        }));
      },
      browserCacheSummary: () => {
        const local = readLocal();
        return {
          apps: local.apps.length,
          accounts: local.accounts.length,
          categories: local.categories.length,
        };
      },
      restoreBrowserCacheToServer: async () => {
        const local = readLocal();
        const payload = storeHasRows(local) ? reconcileStore(local) : reconcileStore(data);
        if (!storeHasRows(payload)) {
          return {
            ok: false,
            message:
              "This browser has no saved list. Use the same browser/profile you used on the old Vercel site, or import a backup file below.",
          };
        }
        try {
          const res = await fetch("/api/store/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ store: payload }),
          });
          const json = (await res.json()) as { store?: StoreData; error?: string; migrated?: boolean };
          if (!res.ok || !json.store) {
            return { ok: false, message: json.error || "Upload to server failed." };
          }
          const next = normalize(json.store);
          persistWatchlist(next);
          setData(next);
          return {
            ok: true,
            message: `Synced to server: ${next.apps.length} apps, ${next.accounts.length} accounts, ${next.categories.length} categories.`,
          };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : "Upload failed." };
        }
      },
      importStoreToServer: async (incoming: StoreData) => {
        const payload = reconcileStore(incoming);
        if (!storeHasRows(payload)) {
          return { ok: false, message: "The file has no apps, accounts, or categories." };
        }
        const toUpload = storeHasRows(data) ? merge(data, payload) : payload;
        try {
          const res = await fetch("/api/store/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ store: toUpload, force: true }),
          });
          const json = (await res.json()) as { store?: StoreData; error?: string; reason?: string };
          if (!res.ok || !json.store) {
            return { ok: false, message: json.error || "Import failed." };
          }
          const next = normalize(json.store);
          persistWatchlist(next);
          setData(next);
          pushStoreToServer(next);
          return {
            ok: true,
            message: `Imported: ${next.apps.length} apps, ${next.accounts.length} accounts. Refresh App / Account Tracking if the list does not update.`,
          };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : "Import failed." };
        }
      },
    }),
    [data, ready, lastCats],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("WatchlistProvider missing");
  return ctx;
}
