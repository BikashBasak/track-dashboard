"use client";

import { useSettings } from "@/components/settings-context";
import { useStorefront } from "@/components/storefront";
import { useWatchlist } from "@/components/watchlist-context";
import { AUTO_SYNC_BACKOFF_MS, AUTO_SYNC_START_DELAY_MS, AUTO_SYNC_TICK_MS } from "@/lib/sync/constants";
import { checkPlayPresence } from "@/lib/sync/check";
import { deepSyncAccountCatalog } from "@/lib/sync/reload-category";
import {
  pickNextSyncItem,
  pruneSyncState,
  recordGoneMiss,
  recordLive,
  recordUncertain,
  type QueueItem,
} from "@/lib/sync/state";
import { useEffect, useRef } from "react";

export function AutoSyncRunner() {
  const { qs } = useStorefront();
  const watch = useWatchlist();
  const { ready: settingsReady, settings, sync, fullSync, replaceSync } = useSettings();
  const watchRef = useRef(watch);
  const syncRef = useRef(sync);
  const qsRef = useRef(qs);
  const baselineRef = useRef(fullSync.baselineReady);
  watchRef.current = watch;
  syncRef.current = sync;
  qsRef.current = qs;
  baselineRef.current = fullSync.baselineReady;

  useEffect(() => {
    if (!settingsReady || !watch.ready || !settings.autoSyncEnabled) return;
    let cancelled = false;
    let timer = 0;
    let inFlight = false;

    async function tick() {
      if (cancelled || inFlight) return AUTO_SYNC_TICK_MS;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return AUTO_SYNC_BACKOFF_MS;
      const current = watchRef.current;
      if (!current.ready) return AUTO_SYNC_TICK_MS;
      const notify = baselineRef.current;
      const apps: QueueItem[] = current.data.apps.map((app) => ({
        kind: "app",
        id: app.appId,
        label: app.title,
      }));
      const accounts: QueueItem[] = current.data.accounts.map((account) => ({
        kind: "account",
        id: account.developerId,
        label: account.name,
      }));
      const now = Date.now();
      let state = pruneSyncState(syncRef.current, {
        apps: apps.map((item) => item.id),
        accounts: accounts.map((item) => item.id),
      });
      const item = pickNextSyncItem(now, apps, accounts, state);
      if (!item) {
        if (state !== syncRef.current) replaceSync(state);
        return AUTO_SYNC_TICK_MS;
      }

      inFlight = true;
      try {
        const result = await checkPlayPresence(qsRef.current, {
          appIds: item.kind === "app" ? [item.id] : [],
          developerIds: item.kind === "account" ? [item.id] : [],
        });
        const row = item.kind === "app" ? result.apps[0] : result.accounts[0];
        const status = row?.status ?? "uncertain";

        if (status === "live") {
          if (item.kind === "app" && result.apps[0]?.app) {
            if (notify) current.applyAppSnapshot(result.apps[0].app);
            else current.applyAppSnapshotSilent(result.apps[0].app);
          }
          if (item.kind === "account") {
            try {
              const account = current.getTrackedAccount(item.id);
              const res = await fetch(`/api/developers/${encodeURIComponent(item.id)}?${qsRef.current}&mergeMarkets=1`);
              const json = await res.json();
              if (res.ok && Array.isArray(json.apps) && json.apps.length) {
                if (notify) {
                  current.applyAccountSnapshot({
                    developerId: item.id,
                    name: json.name || item.label,
                    sampleIcon: json.apps[0]?.icon,
                    apps: json.apps,
                  });
                } else {
                  current.applyAccountSnapshotSilent({
                    developerId: item.id,
                    name: json.name || item.label,
                    sampleIcon: json.apps[0]?.icon,
                    apps: json.apps,
                  });
                }
                if (account) {
                  await deepSyncAccountCatalog(
                    qsRef.current,
                    account,
                    json.apps,
                    {
                      applyAccountSnapshot: notify ? current.applyAccountSnapshot : current.applyAccountSnapshotSilent,
                      untrackAccountLocal: current.untrackAccountLocal,
                      applyAppSnapshot: notify ? current.applyAppSnapshot : current.applyAppSnapshotSilent,
                      applyAppSnapshotSilent: current.applyAppSnapshotSilent,
                      markAppUnpublishedLocal: current.markAppUnpublishedLocal,
                      getTrackedApp: current.getTrackedApp,
                      getTrackedAccount: current.getTrackedAccount,
                      rememberAccountListings: current.rememberAccountListings,
                      rememberAccountCatalog: current.rememberAccountCatalog,
                      archivePlayRemovedApp: current.archivePlayRemovedApp,
                    },
                    { silent: !notify },
                  );
                }
              }
            } catch {
              /* presence already confirmed live; catalog refresh can wait */
            }
          }
          state = recordLive(
            state,
            item,
            Date.now(),
            notify ? `${item.label} is still on Play.` : `${item.label} stored (baseline not ready — no alerts).`,
          );
          replaceSync(state);
          return AUTO_SYNC_TICK_MS;
        }

        if (status === "gone") {
          if (!notify) {
            // Do not remove until a baseline exists and verify sync can compare.
            state = recordUncertain(
              state,
              item,
              Date.now(),
              `${item.label}: Play 404 while baseline missing — not removed.`,
            );
            replaceSync(state);
            return AUTO_SYNC_TICK_MS;
          }
          const { next, confirmed } = recordGoneMiss(state, item, Date.now());
          if (confirmed) {
            if (item.kind === "app") current.markAppUnpublishedLocal(item.id);
            else current.untrackAccountLocal(item.id, "play-removed");
          }
          replaceSync(next);
          return AUTO_SYNC_TICK_MS;
        }

        state = recordUncertain(
          state,
          item,
          Date.now(),
          row?.error || "Play lookup was flaky. Skipped — not treated as removed.",
        );
        replaceSync(state);
        return AUTO_SYNC_BACKOFF_MS;
      } catch (error) {
        replaceSync({
          ...state,
          lastTickAt: Date.now(),
          lastKind: item.kind,
          lastId: item.id,
          lastLabel: item.label,
          lastStatus: "error",
          lastMessage: error instanceof Error ? error.message : "Sync tick failed",
        });
        return AUTO_SYNC_BACKOFF_MS;
      } finally {
        inFlight = false;
      }
    }

    function schedule(delay: number) {
      timer = window.setTimeout(() => {
        void tick().then((nextDelay) => {
          if (!cancelled) schedule(nextDelay ?? AUTO_SYNC_TICK_MS);
        });
      }, delay);
    }

    schedule(AUTO_SYNC_START_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [settings.autoSyncEnabled, settingsReady, watch.ready, replaceSync, fullSync.baselineReady]);

  return null;
}
