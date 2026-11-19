"use client";

import { CategoryPick, trackLabel } from "@/components/category-pick";
import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { EmptyState } from "@/components/ui";
import { useWatchlist } from "@/components/watchlist-context";
import type { AppSummary, PublisherHit } from "@/lib/playstore/types";
import { developerPlayUrl } from "@/lib/utils";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

export function AccountSearch() {
  const { qs } = useStorefront();
  const watch = useWatchlist();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<PublisherHit[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function clearSearch() {
    setQ("");
    setError("");
    setResults(null);
    inputRef.current?.focus();
  }

  async function runSearch(term = q) {
    const value = term.trim();
    if (value.length < 2) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/accounts/search?q=${encodeURIComponent(value)}&${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function trackHit(hit: PublisherHit) {
    if (watch.getTrackedAccount(hit.developerId) || busyId) return;
    setBusyId(hit.developerId);
    try {
      const res = await fetch(`/api/developers/${encodeURIComponent(hit.developerId)}?${qs}&mergeMarkets=1`);
      const data = await res.json();
      const apps: AppSummary[] = res.ok && Array.isArray(data.apps) ? data.apps : [];
      const name = (res.ok && data.name) || hit.name;
      watch.trackAccountLocal({
        developerId: hit.developerId,
        name,
        sampleIcon: apps[0]?.icon || hit.sampleIcon,
        apps,
        categoryId: watch.lastAccountCategoryId,
      });
      fetch(`/api/watchlist?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "account", developerId: hit.developerId, name }),
      }).catch(() => undefined);
    } finally {
      setBusyId("");
    }
  }

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
          placeholder="Exact publisher name, ID, or Play developer URL"
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
      {loading ? <p className="mt-6 text-sm text-mist">Looking up Play Store publishers…</p> : null}
      {error ? <p className="mt-6 text-sm text-[#ff8b8b]">{error}</p> : null}
      {!loading && !error && results && results.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No exact publisher found"
            body="Use the publisher name exactly as it appears on Play, WhatsApp+LLC, or the developer page URL. Related names are not shown."
          />
        </div>
      ) : null}
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(results || []).map((hit) => {
          const tracked = Boolean(watch.getTrackedAccount(hit.developerId));
          const busy = busyId === hit.developerId;
          const lastName = watch.getAccountCategory(watch.lastAccountCategoryId || "")?.name;
          return (
            <div key={`${hit.developerId}-${hit.name}`} className="panel flex items-center gap-3 p-4">
              {hit.sampleIcon ? (
                <img src={hit.sampleIcon} alt="" className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-white/8" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <Link
                    href={`/accounts/${encodeURIComponent(hit.developerId)}`}
                    className="min-w-0 flex-1 truncate font-semibold hover:text-mint"
                  >
                    {hit.name}
                  </Link>
                  <PlayStoreLink href={developerPlayUrl(hit.developerId)} label={`Open ${hit.name} on Play Store`} />
                </div>
                <p className="truncate text-xs text-mist">{developerPlayUrl(hit.developerId)}</p>
                <p className="text-sm text-mist">
                  {hit.exact ? `${hit.appCount} published apps` : `${hit.appCount} apps in results`}
                </p>
                {hit.sampleTitles.length > 0 ? (
                  <p className="mt-1 truncate text-xs text-mist">{hit.sampleTitles.join(" · ")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <CategoryPick
                  categories={watch.data.accountCategories}
                  value={watch.lastAccountCategoryId}
                  onChange={watch.rememberAccountCategory}
                  disabled={tracked}
                  label="Account category"
                />
                <button
                  type="button"
                  onClick={() => void trackHit(hit)}
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
