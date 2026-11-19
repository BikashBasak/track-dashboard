import {
  AUTO_SYNC_CYCLE_MS,
  AUTO_SYNC_REQUIRED_MISSES,
  AUTO_SYNC_SETTINGS_KEY,
  AUTO_SYNC_STATE_KEY,
  AUTO_SYNC_SUSPECT_RETRY_MS,
} from "./constants";

export type SyncItemKind = "app" | "account";

export type AppSettings = {
  autoSyncEnabled: boolean;
};

export type SyncSuspect = {
  misses: number;
  lastMissAt: number;
};

export type AutoSyncState = {
  lastTickAt: number | null;
  lastKind: SyncItemKind | null;
  lastId: string;
  lastLabel: string;
  lastStatus: "idle" | "live" | "gone" | "uncertain" | "error";
  lastMessage: string;
  movedCount: number;
  lastChecked: Record<string, number>;
  suspects: Record<string, SyncSuspect>;
};

export const defaultSettings: AppSettings = {
  autoSyncEnabled: false,
};

export const emptySyncState: AutoSyncState = {
  lastTickAt: null,
  lastKind: null,
  lastId: "",
  lastLabel: "",
  lastStatus: "idle",
  lastMessage: "",
  movedCount: 0,
  lastChecked: {},
  suspects: {},
};

export function syncKey(kind: SyncItemKind, id: string) {
  return `${kind}:${id}`;
}

export function parseSyncKey(key: string): { kind: SyncItemKind; id: string } | null {
  const split = key.indexOf(":");
  if (split < 1) return null;
  const kind = key.slice(0, split);
  const id = key.slice(split + 1);
  if ((kind !== "app" && kind !== "account") || !id) return null;
  return { kind, id };
}

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { autoSyncEnabled: Boolean(parsed.autoSyncEnabled) };
  } catch {
    return { ...defaultSettings };
  }
}

export function writeSettings(next: AppSettings) {
  try {
    localStorage.setItem(AUTO_SYNC_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readSyncState(): AutoSyncState {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_STATE_KEY);
    if (!raw) return { ...emptySyncState, lastChecked: {}, suspects: {} };
    const parsed = JSON.parse(raw) as Partial<AutoSyncState>;
    return {
      ...emptySyncState,
      lastTickAt: parsed.lastTickAt ?? null,
      lastKind: parsed.lastKind === "app" || parsed.lastKind === "account" ? parsed.lastKind : null,
      lastId: parsed.lastId ?? "",
      lastLabel: parsed.lastLabel ?? "",
      lastStatus: parsed.lastStatus ?? "idle",
      lastMessage: parsed.lastMessage ?? "",
      movedCount: parsed.movedCount ?? 0,
      lastChecked: parsed.lastChecked && typeof parsed.lastChecked === "object" ? parsed.lastChecked : {},
      suspects: parsed.suspects && typeof parsed.suspects === "object" ? parsed.suspects : {},
    };
  } catch {
    return { ...emptySyncState, lastChecked: {}, suspects: {} };
  }
}

export function writeSyncState(next: AutoSyncState) {
  try {
    localStorage.setItem(AUTO_SYNC_STATE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export type QueueItem = {
  kind: SyncItemKind;
  id: string;
  label: string;
};

export function pruneSyncState(
  state: AutoSyncState,
  tracked: { apps: string[]; accounts: string[] },
): AutoSyncState {
  const appSet = new Set(tracked.apps);
  const accountSet = new Set(tracked.accounts);
  const keep = (key: string) => {
    const parsed = parseSyncKey(key);
    if (!parsed) return false;
    return parsed.kind === "app" ? appSet.has(parsed.id) : accountSet.has(parsed.id);
  };
  const lastChecked = Object.fromEntries(Object.entries(state.lastChecked).filter(([key]) => keep(key)));
  const suspects = Object.fromEntries(Object.entries(state.suspects).filter(([key]) => keep(key)));
  return { ...state, lastChecked, suspects };
}

export function pickNextSyncItem(
  now: number,
  apps: QueueItem[],
  accounts: QueueItem[],
  state: AutoSyncState,
): QueueItem | null {
  const byKey = new Map<string, QueueItem>();
  for (const item of apps) byKey.set(syncKey("app", item.id), item);
  for (const item of accounts) byKey.set(syncKey("account", item.id), item);
  if (byKey.size === 0) return null;

  const dueSuspects = Object.entries(state.suspects)
    .filter(([key, suspect]) => byKey.has(key) && now - suspect.lastMissAt >= AUTO_SYNC_SUSPECT_RETRY_MS)
    .sort((a, b) => a[1].lastMissAt - b[1].lastMissAt);
  if (dueSuspects[0]) return byKey.get(dueSuspects[0][0]) ?? null;

  const queue = [...byKey.entries()]
    .map(([key, item]) => ({ item, last: state.lastChecked[key] ?? 0 }))
    .sort((a, b) => a.last - b.last);
  const oldest = queue[0];
  if (!oldest) return null;
  if (oldest.last > 0 && now - oldest.last < AUTO_SYNC_CYCLE_MS) return null;
  return oldest.item;
}

export function recordLive(state: AutoSyncState, item: QueueItem, now: number, message: string): AutoSyncState {
  const key = syncKey(item.kind, item.id);
  const suspects = { ...state.suspects };
  delete suspects[key];
  return {
    ...state,
    lastTickAt: now,
    lastKind: item.kind,
    lastId: item.id,
    lastLabel: item.label,
    lastStatus: "live",
    lastMessage: message,
    lastChecked: { ...state.lastChecked, [key]: now },
    suspects,
  };
}

export function recordUncertain(state: AutoSyncState, item: QueueItem, now: number, message: string): AutoSyncState {
  return {
    ...state,
    lastTickAt: now,
    lastKind: item.kind,
    lastId: item.id,
    lastLabel: item.label,
    lastStatus: "uncertain",
    lastMessage: message,
  };
}

export function recordGoneMiss(
  state: AutoSyncState,
  item: QueueItem,
  now: number,
): { next: AutoSyncState; confirmed: boolean } {
  const key = syncKey(item.kind, item.id);
  const prev = state.suspects[key];
  const misses = (prev?.misses ?? 0) + 1;
  const confirmed = misses >= AUTO_SYNC_REQUIRED_MISSES;
  const suspects = { ...state.suspects };
  if (confirmed) delete suspects[key];
  else suspects[key] = { misses, lastMissAt: now };
  const lastChecked = { ...state.lastChecked };
  if (confirmed) delete lastChecked[key];
  else lastChecked[key] = now;
  return {
    confirmed,
    next: {
      ...state,
      lastTickAt: now,
      lastKind: item.kind,
      lastId: item.id,
      lastLabel: item.label,
      lastStatus: "gone",
      lastMessage: confirmed
        ? `Confirmed gone after ${misses} Play 404s — moved to Remove.`
        : `Play 404 (${misses}/${AUTO_SYNC_REQUIRED_MISSES}). Will confirm later before moving.`,
      movedCount: state.movedCount + (confirmed ? 1 : 0),
      lastChecked,
      suspects,
    },
  };
}
