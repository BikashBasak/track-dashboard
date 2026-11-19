"use client";

import { useStorefront } from "@/components/storefront";
import { useWatchlist } from "@/components/watchlist-context";
import { parsePlayBookmarks, type PlayBookmark } from "@/lib/bookmarks/parse";
import type { AppDetails, AppSummary } from "@/lib/playstore/types";
import { FolderInput, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

function displayName(item: PlayBookmark) {
  const by = item.title.match(/^Android Apps by (.+) on Google Play$/i);
  if (by?.[1]) return by[1];
  return item.title.replace(/\s*[—-]\s*Apps on Google Play$/i, "").trim() || item.id;
}

function folderCounts(items: PlayBookmark[]) {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.folder, (map.get(item.folder) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, shouldStop: () => boolean) {
  let next = 0;
  async function worker() {
    while (next < items.length && !shouldStop()) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
}

export function BookmarkImport() {
  const { qs } = useStorefront();
  const watch = useWatchlist();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const [fileName, setFileName] = useState("");
  const [accounts, setAccounts] = useState<PlayBookmark[]>([]);
  const [apps, setApps] = useState<PlayBookmark[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState("");
  const [importAccounts, setImportAccounts] = useState(true);
  const [importApps, setImportApps] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");

  const accountFolders = useMemo(() => folderCounts(accounts), [accounts]);
  const appFolders = useMemo(() => folderCounts(apps), [apps]);

  function resetFile() {
    setFileName("");
    setAccounts([]);
    setApps([]);
    setSkipped(0);
    setError("");
    setResult("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setResult("");
    const html = await file.text();
    if (!html.includes("NETSCAPE-Bookmark-file") && !html.includes("<DT>")) {
      setError("That does not look like a Chrome bookmark HTML export.");
      return;
    }
    const parsed = parsePlayBookmarks(html);
    setFileName(file.name);
    setAccounts(parsed.accounts);
    setApps(parsed.apps);
    setSkipped(parsed.skipped);
    if (parsed.accounts.length === 0 && parsed.apps.length === 0) {
      setError("No Play Store app or developer links were found in that file.");
    }
  }

  function ensureAccountCategory(name: string, cache: Map<string, string>) {
    const key = name.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const created = watch.createAccountCategory(name.trim());
    if (!created) return null;
    cache.set(key, created.id);
    return created.id;
  }

  function ensureAppCategory(name: string, cache: Map<string, string>) {
    const key = name.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const created = watch.createCategory(name.trim());
    if (!created) return null;
    cache.set(key, created.id);
    return created.id;
  }

  async function runImport() {
    abortRef.current = false;
    setBusy(true);
    setResult("");
    const accountCache = new Map(watch.data.accountCategories.map((c) => [c.name.toLowerCase(), c.id]));
    const appCache = new Map(watch.data.categories.map((c) => [c.name.toLowerCase(), c.id]));
    const trackedAccountIds = new Set(watch.data.accounts.map((a) => a.developerId));
    const accountsWithCatalog = new Set(
      watch.data.accounts.filter((a) => (a.catalog?.length ?? 0) > 0).map((a) => a.developerId),
    );
    const trackedAppIds = new Set(watch.data.apps.map((a) => a.appId));
    const removedAccountIds = new Set(watch.data.removedAccounts.map((a) => a.developerId));
    const removedAppIds = new Set(watch.data.removedApps.map((a) => a.appId));
    let addedAccounts = 0;
    let addedApps = 0;
    let already = 0;
    let failed = 0;

    const accountQueue = importAccounts ? accounts : [];
    const appQueue = importApps ? apps : [];
    const hydrateQueue = accountQueue.filter(
      (item) => !accountsWithCatalog.has(item.id) && !removedAccountIds.has(item.id),
    );
    const total = hydrateQueue.length + appQueue.length;
    let done = 0;

    try {
      setProgress(
        accountQueue.length
          ? `Saving ${accountQueue.length} accounts into bookmark folders…`
          : "Preparing import…",
      );
      for (const item of accountQueue) {
        const categoryId = ensureAccountCategory(item.folder, accountCache);
        if (trackedAccountIds.has(item.id) || removedAccountIds.has(item.id)) {
          if (trackedAccountIds.has(item.id) && categoryId) watch.setAccountCategory(item.id, categoryId);
          already += 1;
          continue;
        }
        watch.trackAccountLocal({
          developerId: item.id,
          name: displayName(item),
          apps: [],
          categoryId,
        });
        trackedAccountIds.add(item.id);
        addedAccounts += 1;
      }

      await mapPool(
        hydrateQueue,
        3,
        async (item) => {
          if (abortRef.current) return;
          done += 1;
          setProgress(`Loading Play catalogs ${done}/${total}: ${displayName(item)}`);
          try {
            const res = await fetch(`/api/developers/${encodeURIComponent(item.id)}?${qs}&mergeMarkets=1`);
            const data = await res.json();
            const catalog: AppSummary[] = res.ok && Array.isArray(data.apps) ? data.apps : [];
            if (!res.ok && catalog.length === 0) {
              failed += 1;
              return;
            }
            if (catalog.length === 0) return;
            watch.trackAccountLocal({
              developerId: item.id,
              name: (res.ok && data.name) || displayName(item),
              sampleIcon: catalog[0]?.icon,
              apps: catalog,
              categoryId: ensureAccountCategory(item.folder, accountCache),
            });
            fetch(`/api/watchlist?${qs}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "account", developerId: item.id, name: data.name || displayName(item) }),
            }).catch(() => undefined);
          } catch {
            failed += 1;
          }
        },
        () => abortRef.current,
      );

      await mapPool(
        appQueue,
        3,
        async (item) => {
          if (abortRef.current) return;
          done += 1;
          setProgress(`Apps ${done}/${total}: ${displayName(item)}`);
          const categoryId = ensureAppCategory(item.folder, appCache);
          if (trackedAppIds.has(item.id) || removedAppIds.has(item.id)) {
            if (trackedAppIds.has(item.id) && categoryId) watch.setAppCategory(item.id, categoryId);
            already += 1;
            return;
          }
          try {
            const res = await fetch(`/api/apps/${encodeURIComponent(item.id)}?${qs}`);
            const data = await res.json();
            const details = data.app as AppDetails | undefined;
            if (!res.ok || !details) throw new Error(data.error || "Missing listing");
            watch.trackAppLocal(details, categoryId);
            trackedAppIds.add(item.id);
            fetch(`/api/watchlist?${qs}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "app", appId: details.appId }),
            }).catch(() => undefined);
            addedApps += 1;
          } catch {
            failed += 1;
          }
        },
        () => abortRef.current,
      );
    } finally {
      setBusy(false);
      setProgress("");
      const stopped = abortRef.current ? "Stopped early. " : "";
      setResult(
        `${stopped}Added ${addedAccounts} accounts and ${addedApps} apps. ${already} already tracked. ${failed} Play lookups failed.`,
      );
    }
  }

  const ready = accounts.length + apps.length > 0;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start gap-3">
        <FolderInput className="mt-0.5 h-5 w-5 text-mint" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Import Chrome bookmarks</p>
          <p className="mt-1 text-sm text-mist">
            Export from Chrome bookmark manager, then upload the HTML file. Only Play Store developer and app links are
            imported. Each bookmark folder becomes a category with that folder&apos;s name. Catalog loading can take a
            few minutes on large files — names and folders are saved first, and you can stop anytime.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink">
          <Upload className="h-4 w-4" />
          Choose HTML file
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      </div>

      {fileName ? (
        <p className="mt-3 text-xs text-mist">
          {fileName}
          {ready ? ` · ${accounts.length} accounts · ${apps.length} apps · ${skipped} other links skipped` : null}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-[#ff8b8b]">{error}</p> : null}

      {ready ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={importAccounts}
                disabled={busy}
                onChange={(e) => setImportAccounts(e.target.checked)}
              />
              Accounts ({accounts.length})
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={importApps} disabled={busy} onChange={(e) => setImportApps(e.target.checked)} />
              Apps ({apps.length})
            </label>
          </div>
          {accountFolders.length > 0 && importAccounts ? (
            <p className="text-xs text-mist">
              Account folders:{" "}
              {accountFolders
                .slice(0, 8)
                .map(([name, count]) => `${name} (${count})`)
                .join(" · ")}
              {accountFolders.length > 8 ? ` · +${accountFolders.length - 8} more` : ""}
            </p>
          ) : null}
          {appFolders.length > 0 && importApps ? (
            <p className="text-xs text-mist">
              App folders:{" "}
              {appFolders
                .slice(0, 8)
                .map(([name, count]) => `${name} (${count})`)
                .join(" · ")}
              {appFolders.length > 8 ? ` · +${appFolders.length - 8} more` : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (!importAccounts && !importApps)}
              onClick={() => void runImport()}
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {busy ? "Importing…" : "Import into dashboard"}
            </button>
            {busy ? (
              <button type="button" onClick={() => (abortRef.current = true)} className="rounded-xl border border-white/15 px-4 py-2 text-sm">
                Stop
              </button>
            ) : (
              <button type="button" onClick={resetFile} className="text-sm text-mist hover:text-foam">
                Clear file
              </button>
            )}
          </div>
          {progress ? <p className="text-sm text-mist">{progress}</p> : null}
        </div>
      ) : null}
      {result ? <p className="mt-3 text-sm text-foam">{result}</p> : null}
    </div>
  );
}
