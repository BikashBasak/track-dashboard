import { FULL_SYNC_META_KEY } from "@/lib/sync/constants";

export type FullSyncMeta = {
  /** First successful Sync all finished — later syncs may notify. */
  baselineReady: boolean;
  lastFullSyncAt: number | null;
  lastFullSyncMode: "baseline" | "verify" | null;
  lastMessage: string;
};

export const emptyFullSyncMeta: FullSyncMeta = {
  baselineReady: false,
  lastFullSyncAt: null,
  lastFullSyncMode: null,
  lastMessage: "",
};

export function readFullSyncMeta(): FullSyncMeta {
  try {
    if (typeof window === "undefined") return { ...emptyFullSyncMeta };
    const raw = localStorage.getItem(FULL_SYNC_META_KEY);
    if (!raw) return { ...emptyFullSyncMeta };
    const parsed = JSON.parse(raw) as Partial<FullSyncMeta>;
    return {
      baselineReady: Boolean(parsed.baselineReady),
      lastFullSyncAt: parsed.lastFullSyncAt ?? null,
      lastFullSyncMode: parsed.lastFullSyncMode === "baseline" || parsed.lastFullSyncMode === "verify" ? parsed.lastFullSyncMode : null,
      lastMessage: parsed.lastMessage ?? "",
    };
  } catch {
    return { ...emptyFullSyncMeta };
  }
}

export function writeFullSyncMeta(next: FullSyncMeta) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(FULL_SYNC_META_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
