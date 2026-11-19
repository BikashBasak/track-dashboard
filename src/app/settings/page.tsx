"use client";

import { useSettings } from "@/components/settings-context";
import { useStorefront } from "@/components/storefront";
import { PageHeader } from "@/components/ui";
import { useWatchlist } from "@/components/watchlist-context";
import {
  AUTO_SYNC_CYCLE_MS,
  AUTO_SYNC_REQUIRED_MISSES,
  AUTO_SYNC_SUSPECT_RETRY_MS,
  AUTO_SYNC_TICK_MS,
} from "@/lib/sync/constants";
import { runFullSync, resolveFullSyncMode } from "@/lib/sync/full-sync";
import { readFullSyncMeta } from "@/lib/sync/full-sync-meta";
import { formatDistanceToNow } from "date-fns";
import type { StoreData } from "@/lib/playstore/types";
import { reconcileStore } from "@/lib/store/reconcile";
import { Database, LogOut, RefreshCw, Upload } from "lucide-react";
import { useMemo, useState } from "react";

function minutes(ms: number) {
  return Math.round(ms / 60_000);
}

function parseBackupFileText(text: string): StoreData {
  let trimmed = text.trim();
  if (!trimmed || trimmed === "null") {
    throw new Error("empty");
  }
  let parsed: unknown = JSON.parse(trimmed);
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  if (parsed && typeof parsed === "object" && "store" in parsed && (parsed as { store?: StoreData }).store) {
    return reconcileStore((parsed as { store: StoreData }).store);
  }
  return reconcileStore(parsed as StoreData);
}

export default function SettingsPage() {
  const { qs } = useStorefront();
  const watch = useWatchlist();
  const { ready, settings, sync, fullSync, setAutoSyncEnabled, replaceFullSync, resetBaseline } = useSettings();
  const tracked = watch.data.apps.length + watch.data.accounts.length;
  const suspects = Object.keys(sync.suspects).length;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState(fullSync.lastMessage || "");
  const [dataMsg, setDataMsg] = useState("");
  const [dataBusy, setDataBusy] = useState(false);
  const browserCache = useMemo(() => watch.browserCacheSummary(), [watch]);

  const nextMode = resolveFullSyncMode();

  async function restoreFromBrowser() {
    setDataBusy(true);
    setDataMsg("");
    const result = await watch.restoreBrowserCacheToServer();
    setDataMsg(result.message);
    setDataBusy(false);
  }

  async function onBackupFile(file: File | null) {
    if (!file) return;
    setDataBusy(true);
    setDataMsg("");
    try {
      const text = await file.text();
      const store = parseBackupFileText(text);
      const result = await watch.importStoreToServer(store);
      setDataMsg(result.message);
    } catch {
      setDataMsg(
        "Could not use that file. Save the Vercel copy again in Notepad as my-tracker-backup.json (must start with { and include apps or accounts).",
      );
    } finally {
      setDataBusy(false);
    }
  }

  async function syncAll(forceBaseline = false) {
    if (busy || tracked === 0) return;
    setBusy(true);
    setMessage("");
    setProgress("Starting…");
    try {
      const result = await runFullSync(
        qs,
        {
          data: watch.data,
          applyAppSnapshot: watch.applyAppSnapshot,
          applyAppSnapshotSilent: watch.applyAppSnapshotSilent,
          applyAccountSnapshot: watch.applyAccountSnapshot,
          applyAccountSnapshotSilent: watch.applyAccountSnapshotSilent,
          markAppUnpublishedLocal: watch.markAppUnpublishedLocal,
          untrackAccountLocal: watch.untrackAccountLocal,
          getTrackedApp: watch.getTrackedApp,
          getTrackedAccount: watch.getTrackedAccount,
          rememberAccountListings: watch.rememberAccountListings,
          rememberAccountCatalog: watch.rememberAccountCatalog,
          archivePlayRemovedApp: watch.archivePlayRemovedApp,
        },
        {
          forceBaseline,
          onProgress: (done, total, label) => {
            setProgress(label ? `${done + 1} / ${total} · ${label}` : `${done} / ${total}`);
          },
        },
      );
      replaceFullSync(readFullSyncMeta());
      const parts = [
        result.mode === "baseline" ? "Baseline saved to local database." : "Verify sync finished.",
        `Apps ${result.appsOk}/${watch.data.apps.length}, accounts ${result.accountsOk}/${watch.data.accounts.length}.`,
      ];
      if (result.appsChecked) parts.push(`Deep-checked ${result.appsChecked} catalog apps.`);
      if (result.mode === "verify") {
        if (result.alerts) parts.push(`${result.alerts} notification(s).`);
        if (result.removedApps || result.removedAccounts) {
          parts.push(
            `Unpublished ${result.removedApps} app(s); removed ${result.removedAccounts} account(s).`,
          );
        }
      }
      if (result.errors.length) parts.push(result.errors.slice(0, 3).join(" · "));
      setMessage(parts.join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync all failed");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  return (
    <div>
      <PageHeader
        eyebrow="App"
        title="Settings"
        description="First Sync all stores a Play baseline in this browser. Later Sync all compares live Play to that store and only then notifies."
      />

      <section className="panel mb-4 max-w-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Access</h2>
            <p className="mt-1 text-sm text-mist">
              Dashboard is password-protected. Change the password with the{" "}
              <span className="font-mono text-foam/90">DASHBOARD_PASSWORD</span> env var on Render (or Vercel).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-3 py-2 text-sm text-mist hover:border-[#ff8b8b]/40 hover:text-[#ff8b8b]"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </section>

      <section className="panel mb-4 max-w-2xl p-5">
        <p className="flex items-center gap-2 font-semibold">
          <Upload className="h-4 w-4 text-mint" />
          Recover old Vercel data
        </p>
        <p className="mt-2 text-sm leading-6 text-mist">
          Vercel and Render are different websites — each saves its own copy in the browser. Your full list from Vercel
          is <strong className="font-medium text-foam">not</strong> read automatically here. Copy it from the old Vercel
          tab (Console steps below), save a <span className="font-mono text-foam/90">.json</span> file, then use{" "}
          <strong className="font-medium text-foam">Import JSON backup</strong>.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-mist">
          <li>
            On <span className="font-mono text-foam/90">track-dashboard-five.vercel.app</span> → F12 → Console → paste:{" "}
            <span className="font-mono text-xs text-foam/80">
              copy(localStorage.getItem(&quot;track-dashboard-watchlist-v1&quot;))
            </span>{" "}
            → Notepad → Save as <span className="font-mono text-foam/90">backup.json</span> → import below.
          </li>
          <li>
            Restore from this browser only copies data already saved on <strong className="font-medium text-foam">this</strong>{" "}
            Render site (not Vercel).
          </li>
          <li>
            If Vercel used a <strong className="font-medium text-foam">different</strong> production{" "}
            <span className="font-mono text-foam/90">DATABASE_URL</span>, paste that string in{" "}
            <a
              href="https://dashboard.render.com/web/srv-dbvdbuss728c73ds6700"
              className="text-mint hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Render → Environment
            </a>
            , redeploy, then refresh.
          </li>
        </ul>
        <p className="mt-3 text-sm text-mist">
          Browser cache on this device:{" "}
          <span className="text-foam">
            {browserCache.apps} apps · {browserCache.accounts} accounts · {browserCache.categories} categories
          </span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={dataBusy}
            onClick={() => void restoreFromBrowser()}
            className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {dataBusy ? "Working…" : "Restore from this browser"}
          </button>
          <label className="cursor-pointer rounded-xl border border-white/15 px-4 py-2 text-sm text-foam hover:bg-white/5">
            Import JSON backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={dataBusy}
              onChange={(e) => void onBackupFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {dataMsg ? (
          <p
            className={`mt-3 text-sm ${dataMsg.startsWith("Imported:") || dataMsg.startsWith("Synced") ? "text-mint" : "text-[#ff8b8b]"}`}
          >
            {dataMsg}
          </p>
        ) : null}
      </section>

      <section className="panel mb-4 max-w-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              <Database className="h-4 w-4 text-mint" />
              Sync all (baseline → verify)
            </p>
            <p className="mt-2 text-sm leading-6 text-mist">
              {fullSync.baselineReady
                ? "Baseline is saved. Next Sync all verifies against the stored database and creates notifications for removals, republished apps, new apps, name / description / screenshot changes, and updates."
                : "No baseline yet. First Sync all fetches every tracked app and account and stores listings locally — no change notifications."}
            </p>
          </div>
          <button
            type="button"
            disabled={!ready || busy || tracked === 0}
            onClick={() => void syncAll(false)}
            className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {busy
              ? progress || "Syncing…"
              : nextMode === "baseline"
                ? "Sync all · save baseline"
                : "Sync all · verify & notify"}
          </button>
        </div>

        <p className="mt-4 text-sm font-medium text-foam">
          {fullSync.baselineReady ? "Baseline ready" : "Baseline not saved"}
          {tracked ? ` · ${watch.data.apps.length} apps · ${watch.data.accounts.length} accounts` : ""}
        </p>
        {fullSync.lastFullSyncAt ? (
          <p className="mt-1 text-xs text-mist">
            Last {fullSync.lastFullSyncMode || "sync"}{" "}
            {formatDistanceToNow(fullSync.lastFullSyncAt, { addSuffix: true })}
          </p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-mist">{message}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {fullSync.baselineReady ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm("Clear baseline? Next Sync all will store a fresh database without notifications.")) {
                  resetBaseline();
                  setMessage("Baseline cleared. Run Sync all to save a fresh store.");
                }
              }}
              className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-mist hover:text-foam"
            >
              Reset baseline
            </button>
          ) : null}
          {fullSync.baselineReady ? (
            <button
              type="button"
              disabled={busy || tracked === 0}
              onClick={() => void syncAll(true)}
              className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-mist hover:text-foam"
            >
              Re-save baseline (no notifications)
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel max-w-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              <RefreshCw className="h-4 w-4 text-mint" />
              Auto sync
            </p>
            <p className="mt-2 text-sm leading-6 text-mist">
              While this dashboard is open, recheck one tracked app or account at a time
              (about every {Math.round(AUTO_SYNC_TICK_MS / 1000)} seconds). Notifications only fire after
              a baseline exists. A listing is marked removed only after {AUTO_SYNC_REQUIRED_MISSES}{" "}
              separate Play 404s across markets.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Auto sync"
            aria-checked={settings.autoSyncEnabled}
            disabled={!ready}
            onClick={() => setAutoSyncEnabled(!settings.autoSyncEnabled)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${
              settings.autoSyncEnabled ? "bg-mint" : "bg-white/15"
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                settings.autoSyncEnabled ? "left-7" : "left-1"
              }`}
            />
            <span className="absolute left-[-9999px]">Toggle auto sync</span>
          </button>
        </div>

        <p className="mt-4 text-sm font-medium text-foam">
          {settings.autoSyncEnabled ? "Enabled" : "Disabled"}
          {settings.autoSyncEnabled && !fullSync.baselineReady ? " · storing baseline quietly" : ""}
        </p>
        <p className="mt-1 text-xs leading-5 text-mist">
          {settings.autoSyncEnabled
            ? tracked
              ? `Watching ${watch.data.apps.length} app${watch.data.apps.length === 1 ? "" : "s"} and ${watch.data.accounts.length} account${watch.data.accounts.length === 1 ? "" : "s"}. Healthy listings wait ${Math.round(AUTO_SYNC_CYCLE_MS / 3_600_000)} hours between checks. Suspected takedowns are confirmed after ${minutes(AUTO_SYNC_SUSPECT_RETRY_MS)} minutes.`
              : "Nothing is tracked yet. Add apps or accounts, then keep this tab open."
            : "Turn on to drip-check Play in the background while you use the dashboard."}
        </p>
      </section>

      <section className="panel mt-4 max-w-2xl p-5">
        <h2 className="font-semibold">Last auto sync</h2>
        {sync.lastTickAt ? (
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mist">When</dt>
              <dd>{formatDistanceToNow(sync.lastTickAt, { addSuffix: true })}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Item</dt>
              <dd className="truncate text-right">{sync.lastLabel || sync.lastId || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Result</dt>
              <dd className="capitalize">{sync.lastStatus}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Detail</dt>
              <dd className="max-w-[70%] text-right text-mist">{sync.lastMessage || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Pending confirms</dt>
              <dd>{suspects}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mist">Moved after confirm</dt>
              <dd>{sync.movedCount}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-mist">
            {settings.autoSyncEnabled
              ? "Waiting for the first check. Keep this tab open."
              : "No automatic checks yet."}
          </p>
        )}
      </section>
    </div>
  );
}
