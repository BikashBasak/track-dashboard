"use client";

import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { EmptyState } from "@/components/ui";
import { useWatchlist } from "@/components/watchlist-context";
import type { AppSummary, TrackedApp } from "@/lib/playstore/types";
import { formatNumber, formatScore, developerPlayUrl, playUrl } from "@/lib/utils";
import { Search, Star, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Hit = {
  appId: string;
  title: string;
  icon: string;
  developer: string;
  score: number | null;
  installs?: string;
  genre?: string | null;
};

function matchesQuery(q: string, ...fields: (string | null | undefined)[]) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return false;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

function trackedToHit(app: TrackedApp): Hit {
  const last = app.snapshots.at(-1);
  return {
    appId: app.appId,
    title: app.title,
    icon: app.icon,
    developer: app.developer,
    score: last?.score ?? null,
    installs: last?.maxInstalls ? formatNumber(last.maxInstalls) : last?.installs ?? undefined,
    genre: app.genre ?? last?.genre,
  };
}

function catalogToHit(app: AppSummary): Hit {
  return {
    appId: app.appId,
    title: app.title,
    icon: app.icon,
    developer: app.developer,
    score: app.score,
    installs: app.maxInstalls ? formatNumber(app.maxInstalls) : app.installs,
    genre: app.genre,
  };
}

export function DashboardTrackSearch() {
  const { qs, country } = useStorefront();
  const { data, ready, rememberAccountCatalog } = useWatchlist();
  const [q, setQ] = useState("");
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const missingKey = data.accounts
    .filter((account) => !account.catalog?.length)
    .map((account) => account.developerId)
    .join("|");

  useEffect(() => {
    if (!ready || !missingKey) {
      setLoadingCatalogs(false);
      return;
    }
    let cancelled = false;
    async function loadCatalogs() {
      setLoadingCatalogs(true);
      const ids = missingKey.split("|").filter(Boolean);
      await Promise.all(
        ids.map(async (developerId) => {
          try {
            const res = await fetch(`/api/developers/${encodeURIComponent(developerId)}?${qs}&mergeMarkets=1`);
            const json = await res.json();
            if (cancelled || !res.ok || !Array.isArray(json.apps)) return;
            rememberAccountCatalog(developerId, json.apps, json.name);
          } catch {
            /* keep any saved catalog */
          }
        }),
      );
      if (!cancelled) setLoadingCatalogs(false);
    }
    void loadCatalogs();
    return () => {
      cancelled = true;
    };
    // missingKey is the catalog-gap identity; skip rememberAccountCatalog identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, missingKey, qs]);

  const trackedHits = useMemo(() => {
    if (q.trim().length < 2) return [];
    return data.apps
      .filter((app) => matchesQuery(q, app.title, app.appId, app.developer, app.genre))
      .map(trackedToHit);
  }, [data.apps, q]);

  const accountGroups = useMemo(() => {
    if (q.trim().length < 2) return [];
    return data.accounts
      .map((account) => ({
        developerId: account.developerId,
        name: account.name,
        sampleIcon: account.sampleIcon,
        apps: (account.catalog ?? [])
          .filter((app) => matchesQuery(q, app.title, app.appId, app.developer, app.genre))
          .map(catalogToHit),
      }))
      .filter((group) => group.apps.length > 0);
  }, [data.accounts, q]);

  const catalogCount = data.accounts.reduce((sum, account) => sum + (account.catalog?.length ?? 0), 0);
  const total = trackedHits.length + accountGroups.reduce((sum, group) => sum + group.apps.length, 0);
  const searching = q.trim().length >= 2;

  function clearSearch() {
    setQ("");
    inputRef.current?.focus();
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
        }}
        className="panel flex items-center gap-3 px-4 py-3"
      >
        <Search className="h-5 w-5 text-mint" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tracked apps, e.g. calculator"
          className="h-11 w-full bg-transparent text-base outline-none placeholder:text-mist"
          aria-label="Search tracked apps and account catalogs"
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

      {searching ? (
        <div className="mt-4">
          {loadingCatalogs ? (
            <p className="mb-3 text-sm text-mist">Loading apps from tracked accounts…</p>
          ) : null}
          {!loadingCatalogs && total === 0 ? (
            <EmptyState
              title={`No tracked matches for “${q.trim()}”`}
              body={`Looked through ${data.apps.length} tracked apps and ${catalogCount} apps in ${data.accounts.length} accounts. This does not search the whole Play Store.`}
            />
          ) : null}

          {trackedHits.length > 0 ? (
            <section className="mb-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-mist">
                Tracked apps ({trackedHits.length})
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {trackedHits.map((app) => (
                  <HitCard key={app.appId} app={app} country={country} source="Tracked app" />
                ))}
              </div>
            </section>
          ) : null}

          {accountGroups.map((group) => (
            <section key={group.developerId} className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                {group.sampleIcon ? (
                  <img src={group.sampleIcon} alt="" className="h-6 w-6 rounded-lg object-cover" />
                ) : null}
                <h3 className="min-w-0 flex-1 text-sm font-semibold uppercase tracking-wider text-mist">
                  <Link href={`/accounts/${encodeURIComponent(group.developerId)}`} className="hover:text-mint">
                    {group.name}
                  </Link>{" "}
                  ({group.apps.length})
                </h3>
                <PlayStoreLink href={developerPlayUrl(group.developerId)} label={`Open ${group.name} on Play Store`} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {group.apps.map((app) => (
                  <HitCard
                    key={`${group.developerId}-${app.appId}`}
                    app={app}
                    country={country}
                    source={group.name}
                    accountHref={`/accounts/${encodeURIComponent(group.developerId)}`}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-mist">
          Filters your tracked apps and every app in tracked accounts. Type at least 2 characters.
        </p>
      )}
    </div>
  );
}

function HitCard({
  app,
  country,
  source,
  accountHref,
}: {
  app: Hit;
  country: string;
  source: string;
  accountHref?: string;
}) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <Link href={`/apps/${encodeURIComponent(app.appId)}`} className="shrink-0 hover:opacity-90">
        <img src={app.icon} alt="" className="h-12 w-12 rounded-2xl object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/apps/${encodeURIComponent(app.appId)}`} className="block truncate font-semibold hover:text-mint">
          {app.title}
        </Link>
        <p className="truncate text-sm text-mist">{app.developer}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist">
          {accountHref ? (
            <Link href={accountHref} className="rounded-full bg-white/8 px-2 py-0.5 hover:text-mint">
              {source}
            </Link>
          ) : (
            <span className="rounded-full bg-mint/15 px-2 py-0.5 text-mint">{source}</span>
          )}
          {app.score != null ? (
            <span className="inline-flex items-center gap-1 text-sand">
              <Star className="h-3 w-3 fill-current" />
              {formatScore(app.score)}
            </span>
          ) : null}
          {app.installs ? <span>{app.installs}</span> : null}
          {app.genre ? <span>{app.genre}</span> : null}
        </div>
      </div>
      <PlayStoreLink href={playUrl(app.appId, country)} label={`Open ${app.title} on Play Store`} />
    </div>
  );
}
