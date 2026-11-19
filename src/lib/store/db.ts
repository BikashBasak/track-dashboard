import { ensureSchema, getMeta, getSql, hasDatabaseUrl, setMeta } from "@/lib/db/neon";
import type {
  AccountSnapshot,
  AppDetails,
  AppSnapshot,
  AppSummary,
  RemovedAccount,
  RemovedApp,
  StoreData,
  TrackedAccount,
  TrackedApp,
  TrackedKeyword,
  KeywordSnapshot,
  AppTrackCategory,
  AccountTrackCategory,
  AppListingMemory,
} from "@/lib/playstore/types";
import { reconcileStore } from "@/lib/store/reconcile";
import { snapshotFromAccount, snapshotFromApp } from "@/lib/store/snapshots";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export { snapshotFromAccount, snapshotFromApp };

const STORE_PATH = path.join(process.cwd(), "data", "store.json");
const LIST_SNAPSHOT_CAP = 80;

const empty: StoreData = {
  apps: [],
  accounts: [],
  categories: [],
  accountCategories: [],
  removedApps: [],
  removedAccounts: [],
  keywords: [],
};

function asJson<T>(value: T): string {
  return JSON.stringify(value ?? null);
}

async function insertJsonb(
  text: string,
  params: Array<string | number | null | boolean>,
): Promise<void> {
  const db = getSql();
  await db.query(text, params);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function ensureFile() {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    await writeFile(STORE_PATH, JSON.stringify(empty, null, 2), "utf8");
  }
}

async function readJsonStore(): Promise<StoreData> {
  await ensureFile();
  const raw = await readFile(STORE_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as StoreData;
    return reconcileStore({
      apps: parsed.apps ?? [],
      accounts: (parsed.accounts ?? []).map((acc) => ({ ...acc, categoryId: acc.categoryId ?? null })),
      categories: parsed.categories ?? [],
      accountCategories: parsed.accountCategories ?? [],
      removedApps: parsed.removedApps ?? [],
      removedAccounts: parsed.removedAccounts ?? [],
      keywords: parsed.keywords ?? [],
    });
  } catch {
    return { ...empty };
  }
}

async function writeJsonStore(data: StoreData) {
  await ensureFile();
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function loadCategories(): Promise<{
  categories: AppTrackCategory[];
  accountCategories: AccountTrackCategory[];
}> {
  const db = getSql();
  const cats = await db`SELECT id, name, created_at FROM categories ORDER BY created_at ASC`;
  const accCats = await db`SELECT id, name, created_at FROM account_categories ORDER BY created_at ASC`;
  return {
    categories: cats.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      createdAt: Number(r.created_at),
    })),
    accountCategories: accCats.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      createdAt: Number(r.created_at),
    })),
  };
}

async function loadTrackedApps(snapshotCap = LIST_SNAPSHOT_CAP): Promise<TrackedApp[]> {
  const db = getSql();
  const rows = await db`
    SELECT app_id, title, icon, developer, developer_id, added_at, category_id, genre, genre_id,
           listing_status, unpublished_at
    FROM tracked_apps
    ORDER BY added_at DESC
  `;
  const apps: TrackedApp[] = [];
  for (const r of rows) {
    const appId = String(r.app_id);
    const snaps = await db`
      SELECT ts, payload FROM app_snapshots
      WHERE app_id = ${appId}
      ORDER BY ts DESC
      LIMIT ${snapshotCap}
    `;
    apps.push({
      appId,
      title: String(r.title),
      icon: String(r.icon || ""),
      developer: String(r.developer || ""),
      developerId: r.developer_id ? String(r.developer_id) : undefined,
      addedAt: Number(r.added_at),
      categoryId: r.category_id ? String(r.category_id) : null,
      genre: r.genre ? String(r.genre) : null,
      genreId: r.genre_id ? String(r.genre_id) : null,
      listingStatus: r.listing_status === "unpublished" ? "unpublished" : "live",
      unpublishedAt: r.unpublished_at != null ? Number(r.unpublished_at) : null,
      snapshots: snaps
        .map((s) => ({ ...(parseJson<AppSnapshot>(s.payload, { ts: Number(s.ts) } as AppSnapshot)), ts: Number(s.ts) }))
        .reverse(),
    });
  }
  return apps;
}

async function loadTrackedAccounts(snapshotCap = LIST_SNAPSHOT_CAP): Promise<TrackedAccount[]> {
  const db = getSql();
  const rows = await db`
    SELECT developer_id, name, added_at, sample_icon, app_count, category_id, last_app_ids, catalog, listing_memory
    FROM tracked_accounts
    ORDER BY added_at DESC
  `;
  const accounts: TrackedAccount[] = [];
  for (const r of rows) {
    const developerId = String(r.developer_id);
    const snaps = await db`
      SELECT ts, payload FROM account_snapshots
      WHERE developer_id = ${developerId}
      ORDER BY ts DESC
      LIMIT ${snapshotCap}
    `;
    accounts.push({
      developerId,
      name: String(r.name),
      addedAt: Number(r.added_at),
      sampleIcon: r.sample_icon ? String(r.sample_icon) : undefined,
      appCount: Number(r.app_count || 0),
      categoryId: r.category_id ? String(r.category_id) : null,
      lastAppIds: parseJson<string[]>(r.last_app_ids, []),
      catalog: parseJson<AppSummary[]>(r.catalog, []),
      listingMemory: parseJson<Record<string, AppListingMemory>>(r.listing_memory, {}),
      snapshots: snaps
        .map((s) => ({
          ...(parseJson<AccountSnapshot>(s.payload, { ts: Number(s.ts), appCount: 0, avgScore: null, totalMinInstalls: 0, recentlyUpdatedCount: 0 })),
          ts: Number(s.ts),
        }))
        .reverse(),
    });
  }
  return accounts;
}

async function loadRemoved(): Promise<{ removedApps: RemovedApp[]; removedAccounts: RemovedAccount[] }> {
  const db = getSql();
  const apps = await db`SELECT app_id, removed_at, reason, play_status, payload FROM removed_apps ORDER BY removed_at DESC`;
  const accounts = await db`SELECT developer_id, removed_at, reason, play_status, payload FROM removed_accounts ORDER BY removed_at DESC`;
  return {
    removedApps: apps.map((r) => {
      const base = parseJson<TrackedApp>(r.payload, {
        appId: String(r.app_id),
        title: String(r.app_id),
        icon: "",
        developer: "",
        addedAt: 0,
        snapshots: [],
      });
      return {
        ...base,
        appId: String(r.app_id),
        removedAt: Number(r.removed_at),
        reason: r.reason === "play-removed" ? "play-removed" : "untracked",
        playStatus: (r.play_status as RemovedApp["playStatus"]) || "unknown",
      };
    }),
    removedAccounts: accounts.map((r) => {
      const base = parseJson<TrackedAccount>(r.payload, {
        developerId: String(r.developer_id),
        name: String(r.developer_id),
        addedAt: 0,
        snapshots: [],
      });
      return {
        ...base,
        developerId: String(r.developer_id),
        removedAt: Number(r.removed_at),
        reason: r.reason === "play-removed" ? "play-removed" : "untracked",
        playStatus: (r.play_status as RemovedAccount["playStatus"]) || "unknown",
      };
    }),
  };
}

async function loadKeywords(snapshotCap = LIST_SNAPSHOT_CAP): Promise<TrackedKeyword[]> {
  const db = getSql();
  const rows = await db`SELECT term, added_at FROM tracked_keywords ORDER BY added_at DESC`;
  const keywords: TrackedKeyword[] = [];
  for (const r of rows) {
    const term = String(r.term);
    const snaps = await db`
      SELECT ts, payload FROM keyword_snapshots
      WHERE term = ${term}
      ORDER BY ts DESC
      LIMIT ${snapshotCap}
    `;
    keywords.push({
      term,
      addedAt: Number(r.added_at),
      snapshots: snaps
        .map((s) => ({
          ...(parseJson<KeywordSnapshot>(s.payload, {
            ts: Number(s.ts),
            country: "us",
            lang: "en",
            ranks: [],
          })),
          ts: Number(s.ts),
        }))
        .reverse(),
    });
  }
  return keywords;
}

async function readPgStore(): Promise<StoreData> {
  await ensureSchema();
  const { categories, accountCategories } = await loadCategories();
  const [apps, accounts, removed, keywords] = await Promise.all([
    loadTrackedApps(),
    loadTrackedAccounts(),
    loadRemoved(),
    loadKeywords(),
  ]);
  return reconcileStore({
    apps,
    accounts,
    categories,
    accountCategories,
    removedApps: removed.removedApps,
    removedAccounts: removed.removedAccounts,
    keywords,
  });
}

async function upsertCategoryRows(
  table: "categories" | "account_categories",
  rows: Array<{ id: string; name: string; createdAt: number }>,
) {
  const db = getSql();
  if (table === "categories") {
    await db`DELETE FROM categories`;
    for (const cat of rows) {
      await db`
        INSERT INTO categories (id, name, created_at)
        VALUES (${cat.id}, ${cat.name}, ${cat.createdAt})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      `;
    }
    return;
  }
  await db`DELETE FROM account_categories`;
  for (const cat of rows) {
    await db`
      INSERT INTO account_categories (id, name, created_at)
      VALUES (${cat.id}, ${cat.name}, ${cat.createdAt})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `;
  }
}

async function upsertAppRow(app: TrackedApp) {
  const db = getSql();
  await db`
    INSERT INTO tracked_apps (
      app_id, title, icon, developer, developer_id, added_at, category_id, genre, genre_id, listing_status, unpublished_at
    ) VALUES (
      ${app.appId}, ${app.title}, ${app.icon || ""}, ${app.developer || ""}, ${app.developerId ?? null},
      ${app.addedAt}, ${app.categoryId ?? null}, ${app.genre ?? null}, ${app.genreId ?? null},
      ${app.listingStatus || "live"}, ${app.unpublishedAt ?? null}
    )
    ON CONFLICT (app_id) DO UPDATE SET
      title = EXCLUDED.title,
      icon = EXCLUDED.icon,
      developer = EXCLUDED.developer,
      developer_id = EXCLUDED.developer_id,
      category_id = EXCLUDED.category_id,
      genre = EXCLUDED.genre,
      genre_id = EXCLUDED.genre_id,
      listing_status = EXCLUDED.listing_status,
      unpublished_at = EXCLUDED.unpublished_at
  `;
  for (const snap of app.snapshots || []) {
    await insertJsonb(
      `INSERT INTO app_snapshots (app_id, ts, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (app_id, ts) DO UPDATE SET payload = EXCLUDED.payload`,
      [app.appId, snap.ts, asJson(snap)],
    );
  }
}

async function upsertAccountRow(account: TrackedAccount) {
  const db = getSql();
  await insertJsonb(
    `INSERT INTO tracked_accounts (
      developer_id, name, added_at, sample_icon, app_count, category_id, last_app_ids, catalog, listing_memory
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb
    )
    ON CONFLICT (developer_id) DO UPDATE SET
      name = EXCLUDED.name,
      sample_icon = EXCLUDED.sample_icon,
      app_count = EXCLUDED.app_count,
      category_id = EXCLUDED.category_id,
      last_app_ids = EXCLUDED.last_app_ids,
      catalog = EXCLUDED.catalog,
      listing_memory = EXCLUDED.listing_memory`,
    [
      account.developerId,
      account.name,
      account.addedAt,
      account.sampleIcon ?? null,
      account.appCount ?? 0,
      account.categoryId ?? null,
      asJson(account.lastAppIds || []),
      asJson(account.catalog || []),
      asJson(account.listingMemory || {}),
    ],
  );
  for (const snap of account.snapshots || []) {
    await insertJsonb(
      `INSERT INTO account_snapshots (developer_id, ts, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (developer_id, ts) DO UPDATE SET payload = EXCLUDED.payload`,
      [account.developerId, snap.ts, asJson(snap)],
    );
  }
}

async function upsertKeywordRow(keyword: TrackedKeyword) {
  const db = getSql();
  await db`
    INSERT INTO tracked_keywords (term, added_at)
    VALUES (${keyword.term}, ${keyword.addedAt})
    ON CONFLICT (term) DO UPDATE SET added_at = LEAST(tracked_keywords.added_at, EXCLUDED.added_at)
  `;
  for (const snap of keyword.snapshots || []) {
    await insertJsonb(
      `INSERT INTO keyword_snapshots (term, ts, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (term, ts) DO UPDATE SET payload = EXCLUDED.payload`,
      [keyword.term, snap.ts, asJson(snap)],
    );
  }
}

/** Upsert client store into Postgres without deleting historical snapshots not present in payload. */
export async function upsertStoreData(data: StoreData): Promise<StoreData> {
  if (!hasDatabaseUrl()) {
    await writeJsonStore(reconcileStore(data));
    return readJsonStore();
  }
  await ensureSchema();
  const db = getSql();
  const incoming = reconcileStore(data);

  await upsertCategoryRows("categories", incoming.categories);
  await upsertCategoryRows("account_categories", incoming.accountCategories);

  const keepAppIds = new Set(incoming.apps.map((a) => a.appId));
  const existingApps = await db`SELECT app_id FROM tracked_apps`;
  for (const row of existingApps) {
    const id = String(row.app_id);
    if (!keepAppIds.has(id) && !incoming.removedApps.some((r) => r.appId === id)) {
      await db`DELETE FROM tracked_apps WHERE app_id = ${id}`;
    }
  }
  for (const app of incoming.apps) {
    await db`DELETE FROM removed_apps WHERE app_id = ${app.appId}`;
    await upsertAppRow(app);
  }

  const keepDevIds = new Set(incoming.accounts.map((a) => a.developerId));
  const existingAccounts = await db`SELECT developer_id FROM tracked_accounts`;
  for (const row of existingAccounts) {
    const id = String(row.developer_id);
    if (!keepDevIds.has(id) && !incoming.removedAccounts.some((r) => r.developerId === id)) {
      await db`DELETE FROM tracked_accounts WHERE developer_id = ${id}`;
    }
  }
  for (const account of incoming.accounts) {
    await db`DELETE FROM removed_accounts WHERE developer_id = ${account.developerId}`;
    await upsertAccountRow(account);
  }

  await db`DELETE FROM removed_apps`;
  for (const removed of incoming.removedApps) {
    const { removedAt, reason, playStatus, ...payload } = removed;
    await insertJsonb(
      `INSERT INTO removed_apps (app_id, removed_at, reason, play_status, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (app_id) DO UPDATE SET
         removed_at = EXCLUDED.removed_at,
         reason = EXCLUDED.reason,
         play_status = EXCLUDED.play_status,
         payload = EXCLUDED.payload`,
      [removed.appId, removedAt, reason, playStatus ?? null, asJson(payload)],
    );
    await db`DELETE FROM tracked_apps WHERE app_id = ${removed.appId}`;
  }

  await db`DELETE FROM removed_accounts`;
  for (const removed of incoming.removedAccounts) {
    const { removedAt, reason, playStatus, ...payload } = removed;
    await insertJsonb(
      `INSERT INTO removed_accounts (developer_id, removed_at, reason, play_status, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (developer_id) DO UPDATE SET
         removed_at = EXCLUDED.removed_at,
         reason = EXCLUDED.reason,
         play_status = EXCLUDED.play_status,
         payload = EXCLUDED.payload`,
      [removed.developerId, removedAt, reason, playStatus ?? null, asJson(payload)],
    );
    await db`DELETE FROM tracked_accounts WHERE developer_id = ${removed.developerId}`;
  }

  const keepTerms = new Set(incoming.keywords.map((k) => k.term));
  const existingKw = await db`SELECT term FROM tracked_keywords`;
  for (const row of existingKw) {
    const term = String(row.term);
    if (!keepTerms.has(term)) await db`DELETE FROM tracked_keywords WHERE term = ${term}`;
  }
  for (const keyword of incoming.keywords) {
    await upsertKeywordRow(keyword);
  }

  return readPgStore();
}

export async function isStoreEmpty(): Promise<boolean> {
  if (!hasDatabaseUrl()) {
    const data = await readJsonStore();
    return (
      data.apps.length === 0 &&
      data.accounts.length === 0 &&
      data.categories.length === 0 &&
      data.accountCategories.length === 0 &&
      data.removedApps.length === 0 &&
      data.removedAccounts.length === 0 &&
      data.keywords.length === 0
    );
  }
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    SELECT
      (SELECT COUNT(*)::int FROM tracked_apps) AS apps,
      (SELECT COUNT(*)::int FROM tracked_accounts) AS accounts,
      (SELECT COUNT(*)::int FROM categories) AS categories,
      (SELECT COUNT(*)::int FROM account_categories) AS account_categories,
      (SELECT COUNT(*)::int FROM removed_apps) AS removed_apps,
      (SELECT COUNT(*)::int FROM removed_accounts) AS removed_accounts,
      (SELECT COUNT(*)::int FROM tracked_keywords) AS keywords
  `;
  const r = rows[0] || {};
  return !(
    Number(r.apps) ||
    Number(r.accounts) ||
    Number(r.categories) ||
    Number(r.account_categories) ||
    Number(r.removed_apps) ||
    Number(r.removed_accounts) ||
    Number(r.keywords)
  );
}

export async function migrateFromLocal(data: StoreData): Promise<{ migrated: boolean; store: StoreData; reason?: string }> {
  if (!hasDatabaseUrl()) {
    const store = await upsertStoreData(data);
    return { migrated: true, store, reason: "json-fallback" };
  }
  await ensureSchema();
  const already = await getMeta("migrated_from_local_at");
  const emptyDb = await isStoreEmpty();
  if (already && !emptyDb) {
    return { migrated: false, store: await readPgStore(), reason: "already-migrated" };
  }
  const store = await upsertStoreData(data);
  await setMeta("migrated_from_local_at", String(Date.now()));
  return { migrated: true, store };
}

export async function readStore(): Promise<StoreData> {
  if (!hasDatabaseUrl()) return readJsonStore();
  try {
    return await readPgStore();
  } catch (err) {
    console.error("[store] postgres read failed, falling back to json", err);
    return readJsonStore();
  }
}

export async function getAppHistory(appId: string): Promise<{ app: TrackedApp | null; snapshots: AppSnapshot[] }> {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const app = store.apps.find((a) => a.appId === appId) || null;
    return { app, snapshots: app?.snapshots || [] };
  }
  await ensureSchema();
  const db = getSql();
  const rows = await db`
    SELECT app_id, title, icon, developer, developer_id, added_at, category_id, genre, genre_id,
           listing_status, unpublished_at
    FROM tracked_apps WHERE app_id = ${appId} LIMIT 1
  `;
  if (!rows[0]) {
    const removed = await db`SELECT payload FROM removed_apps WHERE app_id = ${appId} LIMIT 1`;
    if (!removed[0]) return { app: null, snapshots: [] };
    const app = parseJson<TrackedApp>(removed[0].payload, null as unknown as TrackedApp);
    return { app, snapshots: app?.snapshots || [] };
  }
  const r = rows[0];
  const snaps = await db`
    SELECT ts, payload FROM app_snapshots
    WHERE app_id = ${appId}
    ORDER BY ts ASC
  `;
  const snapshots = snaps.map((s) => ({
    ...(parseJson<AppSnapshot>(s.payload, { ts: Number(s.ts) } as AppSnapshot)),
    ts: Number(s.ts),
  }));
  const app: TrackedApp = {
    appId,
    title: String(r.title),
    icon: String(r.icon || ""),
    developer: String(r.developer || ""),
    developerId: r.developer_id ? String(r.developer_id) : undefined,
    addedAt: Number(r.added_at),
    categoryId: r.category_id ? String(r.category_id) : null,
    genre: r.genre ? String(r.genre) : null,
    genreId: r.genre_id ? String(r.genre_id) : null,
    listingStatus: r.listing_status === "unpublished" ? "unpublished" : "live",
    unpublishedAt: r.unpublished_at != null ? Number(r.unpublished_at) : null,
    snapshots,
  };
  return { app, snapshots };
}

export async function trackApp(app: AppDetails): Promise<TrackedApp> {
  const snap = snapshotFromApp(app);
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const existing = store.apps.find((a) => a.appId === app.appId);
    if (existing) {
      existing.title = app.title;
      existing.icon = app.icon;
      existing.developer = app.developer;
      existing.developerId = app.developerId;
      existing.genre = app.genre ?? existing.genre;
      existing.genreId = app.genreId ?? existing.genreId;
      existing.listingStatus = "live";
      existing.unpublishedAt = null;
      existing.snapshots.push(snap);
      await writeJsonStore(store);
      return existing;
    }
    const tracked: TrackedApp = {
      appId: app.appId,
      title: app.title,
      icon: app.icon,
      developer: app.developer,
      developerId: app.developerId,
      genre: app.genre ?? null,
      genreId: app.genreId ?? null,
      addedAt: Date.now(),
      snapshots: [snap],
      listingStatus: "live",
      unpublishedAt: null,
    };
    store.apps.unshift(tracked);
    store.removedApps = store.removedApps.filter((a) => a.appId !== app.appId);
    await writeJsonStore(store);
    return tracked;
  }

  await ensureSchema();
  const db = getSql();
  await db`DELETE FROM removed_apps WHERE app_id = ${app.appId}`;
  const existing = await db`SELECT * FROM tracked_apps WHERE app_id = ${app.appId} LIMIT 1`;
  const addedAt = existing[0] ? Number(existing[0].added_at) : Date.now();
  const tracked: TrackedApp = {
    appId: app.appId,
    title: app.title,
    icon: app.icon,
    developer: app.developer,
    developerId: app.developerId,
    genre: app.genre ?? null,
    genreId: app.genreId ?? null,
    addedAt,
    categoryId: existing[0]?.category_id ? String(existing[0].category_id) : null,
    listingStatus: "live",
    unpublishedAt: null,
    snapshots: [snap],
  };
  await upsertAppRow(tracked);
  const history = await getAppHistory(app.appId);
  return history.app || tracked;
}

export async function untrackApp(appId: string) {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const current = store.apps.find((a) => a.appId === appId);
    store.apps = store.apps.filter((a) => a.appId !== appId);
    if (current && !store.removedApps.some((a) => a.appId === appId)) {
      store.removedApps = [
        { ...current, removedAt: Date.now(), reason: "untracked", playStatus: "unknown" },
        ...store.removedApps,
      ];
    }
    await writeJsonStore(store);
    return;
  }
  await ensureSchema();
  const db = getSql();
  const history = await getAppHistory(appId);
  if (history.app) {
    await insertJsonb(
      `INSERT INTO removed_apps (app_id, removed_at, reason, play_status, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (app_id) DO UPDATE SET
         removed_at = EXCLUDED.removed_at,
         reason = EXCLUDED.reason,
         payload = EXCLUDED.payload`,
      [appId, Date.now(), "untracked", "unknown", asJson(history.app)],
    );
  }
  await db`DELETE FROM tracked_apps WHERE app_id = ${appId}`;
}

export async function trackAccount(input: {
  developerId: string;
  name: string;
  sampleIcon?: string;
  apps: AppSummary[];
}): Promise<TrackedAccount> {
  const snap = snapshotFromAccount(input.apps, input.name);
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const existing = store.accounts.find((a) => a.developerId === input.developerId);
    if (existing) {
      existing.name = input.name;
      existing.sampleIcon = input.sampleIcon ?? existing.sampleIcon;
      existing.appCount = input.apps.length;
      existing.lastAppIds = input.apps.map((a) => a.appId);
      existing.catalog = input.apps;
      existing.snapshots.push(snap);
      await writeJsonStore(store);
      return existing;
    }
    const tracked: TrackedAccount = {
      developerId: input.developerId,
      name: input.name,
      addedAt: Date.now(),
      sampleIcon: input.sampleIcon,
      appCount: input.apps.length,
      lastAppIds: input.apps.map((a) => a.appId),
      catalog: input.apps,
      categoryId: null,
      snapshots: [snap],
    };
    store.accounts.unshift(tracked);
    store.removedAccounts = store.removedAccounts.filter((a) => a.developerId !== input.developerId);
    await writeJsonStore(store);
    return tracked;
  }

  await ensureSchema();
  const db = getSql();
  await db`DELETE FROM removed_accounts WHERE developer_id = ${input.developerId}`;
  const existing = await db`SELECT * FROM tracked_accounts WHERE developer_id = ${input.developerId} LIMIT 1`;
  const tracked: TrackedAccount = {
    developerId: input.developerId,
    name: input.name,
    addedAt: existing[0] ? Number(existing[0].added_at) : Date.now(),
    sampleIcon: input.sampleIcon,
    appCount: input.apps.length,
    lastAppIds: input.apps.map((a) => a.appId),
    catalog: input.apps,
    categoryId: existing[0]?.category_id ? String(existing[0].category_id) : null,
    listingMemory: existing[0] ? parseJson(existing[0].listing_memory, {}) : {},
    snapshots: [snap],
  };
  await upsertAccountRow(tracked);
  const store = await readPgStore();
  return store.accounts.find((a) => a.developerId === input.developerId) || tracked;
}

export async function clearRemovedApps() {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    store.removedApps = [];
    await writeJsonStore(store);
    return;
  }
  await ensureSchema();
  const db = getSql();
  await db`DELETE FROM removed_apps`;
}

export async function clearRemovedAccounts() {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    store.removedAccounts = [];
    await writeJsonStore(store);
    return;
  }
  await ensureSchema();
  const db = getSql();
  await db`DELETE FROM removed_accounts`;
}

export async function untrackAccount(developerId: string) {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const current = store.accounts.find((a) => a.developerId === developerId);
    store.accounts = store.accounts.filter((a) => a.developerId !== developerId);
    if (current && !store.removedAccounts.some((a) => a.developerId === developerId)) {
      store.removedAccounts = [
        { ...current, removedAt: Date.now(), reason: "untracked", playStatus: "unknown" },
        ...store.removedAccounts,
      ];
    }
    await writeJsonStore(store);
    return;
  }
  await ensureSchema();
  const db = getSql();
  const store = await readPgStore();
  const current = store.accounts.find((a) => a.developerId === developerId);
  if (current) {
    await insertJsonb(
      `INSERT INTO removed_accounts (developer_id, removed_at, reason, play_status, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (developer_id) DO UPDATE SET
         removed_at = EXCLUDED.removed_at,
         reason = EXCLUDED.reason,
         payload = EXCLUDED.payload`,
      [developerId, Date.now(), "untracked", "unknown", asJson(current)],
    );
  }
  await db`DELETE FROM tracked_accounts WHERE developer_id = ${developerId}`;
}

export async function appendAppSnapshot(appId: string, snap: AppSnapshot) {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const app = store.apps.find((a) => a.appId === appId);
    if (!app) return;
    app.snapshots.push(snap);
    if (snap.title) app.title = snap.title;
    if (snap.icon) app.icon = snap.icon;
    if (snap.genre) app.genre = snap.genre;
    if (snap.genreId) app.genreId = snap.genreId;
    await writeJsonStore(store);
    return;
  }
  await ensureSchema();
  const db = getSql();
  const exists = await db`SELECT app_id FROM tracked_apps WHERE app_id = ${appId} LIMIT 1`;
  if (!exists[0]) return;
  await insertJsonb(
    `INSERT INTO app_snapshots (app_id, ts, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (app_id, ts) DO UPDATE SET payload = EXCLUDED.payload`,
    [appId, snap.ts, asJson(snap)],
  );
  if (snap.title || snap.icon || snap.genre || snap.genreId) {
    await db`
      UPDATE tracked_apps SET
        title = COALESCE(${snap.title ?? null}, title),
        icon = COALESCE(${snap.icon ?? null}, icon),
        genre = COALESCE(${snap.genre ?? null}, genre),
        genre_id = COALESCE(${snap.genreId ?? null}, genre_id),
        listing_status = 'live',
        unpublished_at = NULL
      WHERE app_id = ${appId}
    `;
  }
}

export async function appendAccountSnapshot(
  developerId: string,
  snap: AccountSnapshot,
  extra?: Partial<TrackedAccount>,
) {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const account = store.accounts.find((a) => a.developerId === developerId);
    if (!account) return;
    Object.assign(account, extra);
    account.snapshots.push(snap);
    await writeJsonStore(store);
    return;
  }
  await ensureSchema();
  const db = getSql();
  const exists = await db`SELECT developer_id FROM tracked_accounts WHERE developer_id = ${developerId} LIMIT 1`;
  if (!exists[0]) return;
  await insertJsonb(
    `INSERT INTO account_snapshots (developer_id, ts, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (developer_id, ts) DO UPDATE SET payload = EXCLUDED.payload`,
    [developerId, snap.ts, asJson(snap)],
  );
  if (extra) {
    await insertJsonb(
      `UPDATE tracked_accounts SET
         name = COALESCE($2, name),
         sample_icon = COALESCE($3, sample_icon),
         app_count = COALESCE($4, app_count),
         last_app_ids = COALESCE($5::jsonb, last_app_ids),
         catalog = COALESCE($6::jsonb, catalog),
         listing_memory = COALESCE($7::jsonb, listing_memory)
       WHERE developer_id = $1`,
      [
        developerId,
        extra.name ?? null,
        extra.sampleIcon ?? null,
        extra.appCount ?? null,
        extra.lastAppIds ? asJson(extra.lastAppIds) : null,
        extra.catalog ? asJson(extra.catalog) : null,
        extra.listingMemory ? asJson(extra.listingMemory) : null,
      ],
    );
  }
}

export async function markAppUnpublished(appId: string, unpublishedAt = Date.now()) {
  if (!hasDatabaseUrl()) {
    const store = await readJsonStore();
    const app = store.apps.find((a) => a.appId === appId);
    if (!app) return;
    app.listingStatus = "unpublished";
    app.unpublishedAt = unpublishedAt;
    await writeJsonStore(store);
    return;
  }
  await ensureSchema();
  const db = getSql();
  await db`
    UPDATE tracked_apps
    SET listing_status = 'unpublished', unpublished_at = ${unpublishedAt}
    WHERE app_id = ${appId}
  `;
}
