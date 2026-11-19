"use client";

import { AppIcon } from "@/components/app-icon";
import { CategoryPick, trackLabel } from "@/components/category-pick";
import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { EmptyState } from "@/components/ui";
import { useWatchlist } from "@/components/watchlist-context";
import type { AppDetails, AppSummary } from "@/lib/playstore/types";
import { playUrl } from "@/lib/utils";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AppSearch({
  initialQuery = "",
  onResults,
}: {
  initialQuery?: string;
  onResults?: (apps: AppSummary[]) => void;
}) {
  const { qs, country } = useStorefront();
  const watch = useWatchlist();
  const [q, setQ] = useState(initialQuery);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<AppSummary[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function clearSearch() {
    setQ("");
    setError("");
    setResults([]);
    setSuggestions([]);
    onResults?.([]);
    inputRef.current?.focus();
  }

  async function runSearch(term = q) {
    const value = term.trim();
    if (value.length < 2) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}&${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results || []);
      onResults?.(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery) void runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, qs]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}&${qs}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, qs]);

  async function trackApp(app: AppSummary) {
    if (watch.getTrackedApp(app.appId) || busyId) return;
    setBusyId(app.appId);
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(app.appId)}?${qs}`);
      const data = await res.json();
      const details = (data.app as AppDetails | undefined) ?? null;
      if (details) {
        watch.trackAppLocal(details, watch.lastAppCategoryId);
        fetch(`/api/watchlist?${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "app", appId: details.appId }),
        }).catch(() => undefined);
      }
    } finally {
      setBusyId("");
    }
  }

  const lastName = watch.getCategory(watch.lastAppCategoryId || "")?.name;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        className="panel flex items-center gap-3 px-4 py-3"
      >
        <Search className="h-5 w-5 text-mint" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by app name or package id, e.g. WhatsApp or com.whatsapp"
          className="h-11 w-full bg-transparent text-base outline-none placeholder:text-mist"
        />
        {q ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="rounded-lg p-1.5 text-mist hover:bg-white/10 hover:text-foam"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink">Search</button>
      </form>
      {suggestions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQ(s);
                void runSearch(s);
              }}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist hover:border-mint/40 hover:text-foam"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {loading ? <p className="mt-6 text-sm text-mist">Looking up Play Store listings…</p> : null}
      {error ? <p className="mt-6 text-sm text-[#ff8b8b]">{error}</p> : null}
      {!loading && !error && results.length === 0 && q.length >= 2 ? (
        <div className="mt-6">
          <EmptyState title="No apps found" body="Try a package name like com.spotify.music or a shorter keyword." />
        </div>
      ) : null}
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {results.map((app) => {
          const tracked = Boolean(watch.getTrackedApp(app.appId));
          const busy = busyId === app.appId;
          return (
            <div key={app.appId} className="panel flex items-center gap-3 p-4">
              <AppIcon src={app.icon} className="h-14 w-14 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <Link href={`/apps/${encodeURIComponent(app.appId)}`} className="block truncate font-semibold hover:text-mint">
                  {app.title}
                </Link>
                <p className="truncate text-sm text-mist">{app.developer}</p>
                {app.installs ? <p className="mt-1 text-xs text-mist">{app.installs}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <PlayStoreLink href={playUrl(app.appId, country)} label={`Open ${app.title} on Play Store`} />
                  <CategoryPick
                    categories={watch.data.categories}
                    value={watch.lastAppCategoryId}
                    onChange={watch.rememberAppCategory}
                    disabled={tracked}
                    label="App category"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void trackApp(app)}
                  disabled={tracked || busy}
                  className="rounded-lg bg-mint px-3 py-1.5 text-xs font-semibold text-ink disabled:bg-white/10 disabled:text-mint"
                >
                  {trackLabel(tracked, busy, lastName)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
