"use client";

import { AppIcon } from "@/components/app-icon";
import { PlayStoreLink } from "@/components/play-store-link";
import { ScreenshotScroller } from "@/components/screenshot-scroller";
import { useStorefront } from "@/components/storefront";
import { deriveAppMetrics, formatAgeDays } from "@/lib/playstore/metrics";
import type { AppDetails, AppSummary, DerivedAppMetrics } from "@/lib/playstore/types";
import { catalogFromApps } from "@/lib/store/snapshots";
import { formatNumber, formatScore, normalizeMediaUrl, playUrl } from "@/lib/utils";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = AppSummary &
  Partial<AppDetails> & {
    hydrated?: boolean;
    metrics?: DerivedAppMetrics;
  };

function hasInstalls(app: Pick<AppSummary, "maxInstalls" | "minInstalls" | "installs">) {
  return app.maxInstalls != null || app.minInstalls != null || Boolean(app.installs);
}

function needsPlayListing(app: AppSummary) {
  return !hasInstalls(app) || !app.genre || !app.released || app.score == null || !normalizeMediaUrl(app.icon);
}

function needsScreenshots(app: AppSummary | Row) {
  const shots = (app as Row).screenshots;
  return !Array.isArray(shots) || shots.length === 0;
}

function MetricCell({
  label,
  value,
  title,
  className,
}: {
  label: string;
  value: string;
  title?: string;
  className?: string;
}) {
  return (
    <span className={className} title={title}>
      <span className="mr-1 text-[10px] uppercase tracking-wide text-mist/80 sm:hidden">{label}</span>
      {value}
    </span>
  );
}

export function AccountAppList({
  apps,
  sort = "installs",
  hydrate = true,
  framed = true,
  accountName,
  showScreenshots = false,
  compact = false,
  onHydrated,
}: {
  apps: AppSummary[];
  sort?: "score" | "installs" | "name" | "age";
  hydrate?: boolean;
  framed?: boolean;
  accountName?: string;
  /** Load + show screenshots (collapsed behind Show media by default when compact). */
  showScreenshots?: boolean;
  /** Denser Account Tracking details rows: hide age + account subtitle. */
  compact?: boolean;
  onHydrated?: (apps: AppSummary[]) => void;
}) {
  const { qs, country } = useStorefront();
  const [rows, setRows] = useState<Row[]>([]);
  const [hydrating, setHydrating] = useState(false);
  const [mediaOpen, setMediaOpen] = useState<Record<string, boolean>>({});
  const idsKey = apps.map((a) => a.appId).join("|");
  const onHydratedRef = useRef(onHydrated);
  onHydratedRef.current = onHydrated;
  const showAccountSubtitle = Boolean(accountName) && !compact;
  const showAge = !compact;

  useEffect(() => {
    const initial: Row[] = apps.map((app) => ({
      ...app,
      hydrated: !needsPlayListing(app) && !(showScreenshots && needsScreenshots(app)),
      metrics: deriveAppMetrics(app),
    }));
    setRows(initial);
    if (!hydrate) {
      setHydrating(false);
      return;
    }
    const pending = initial
      .filter((row) => needsPlayListing(row) || (showScreenshots && needsScreenshots(row)))
      .map((row) => row.appId);
    if (pending.length === 0) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    async function loadDetails() {
      setHydrating(true);
      for (let i = 0; i < pending.length; i += 4) {
        if (cancelled) return;
        const chunk = pending.slice(i, i + 4);
        try {
          const res = await fetch(`/api/explorer?${qs}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appIds: chunk }),
          });
          const data = await res.json();
          const details = (data.apps || []) as AppDetails[];
          if (cancelled) return;
          let nextRows: Row[] = [];
          setRows((prev) => {
            nextRows = prev.map((row) => {
              const full = details.find((d) => d.appId === row.appId);
              if (full) return { ...row, ...full, hydrated: true, metrics: deriveAppMetrics(full) };
              if (chunk.includes(row.appId)) return { ...row, hydrated: true };
              return row;
            });
            return nextRows;
          });
          onHydratedRef.current?.(catalogFromApps(nextRows));
        } catch {
          if (!cancelled) {
            setRows((prev) =>
              prev.map((row) => (chunk.includes(row.appId) ? { ...row, hydrated: true } : row)),
            );
          }
        }
      }
      if (!cancelled) setHydrating(false);
    }
    void loadDetails();
    return () => {
      cancelled = true;
    };
    // Catalog identity is idsKey; avoid resetting hydrate on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, qs, hydrate, showScreenshots]);

  const visible = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      if (sort === "score") return (b.score ?? 0) - (a.score ?? 0);
      if (sort === "name") return a.title.localeCompare(b.title);
      if (sort === "age") return (a.metrics?.ageDays ?? 99999) - (b.metrics?.ageDays ?? 99999);
      return (b.maxInstalls ?? b.minInstalls ?? 0) - (a.maxInstalls ?? a.minInstalls ?? 0);
    });
    return list;
  }, [rows, sort]);

  if (apps.length === 0) {
    return framed ? (
      <p className="panel px-4 py-8 text-center text-sm text-mist">This publisher has no listed apps.</p>
    ) : (
      <p className="px-4 py-6 text-center text-sm text-mist">This publisher has no listed apps.</p>
    );
  }

  const installsValue = (app: Row) => {
    if (app.maxInstalls) return formatNumber(app.maxInstalls);
    if (app.installs) return app.installs;
    if (app.minInstalls) return formatNumber(app.minInstalls);
    return app.hydrated ? "—" : "…";
  };
  const ageValue = (app: Row) => {
    if (app.metrics?.ageDays != null) return formatAgeDays(app.metrics.ageDays);
    return app.hydrated ? "—" : "…";
  };
  const genreValue = (app: Row) => {
    if (app.genre) return app.genre;
    return app.hydrated ? "—" : "…";
  };
  const ratingValue = (app: Row) => {
    if (app.score != null) return formatScore(app.score);
    return app.hydrated ? "—" : "…";
  };

  const gridCols = showAge
    ? "sm:grid-cols-[minmax(0,1.6fr)_5.5rem_4.5rem_3.75rem_minmax(0,7rem)_2rem]"
    : "sm:grid-cols-[minmax(0,1.6fr)_5.5rem_4.5rem_minmax(0,7rem)_2rem]";

  return (
    <div>
      {hydrating ? (
        <p className="border-b border-white/6 px-3 py-2 text-[11px] text-mist">Updating listing metrics…</p>
      ) : null}
      <div className={framed ? "panel overflow-hidden" : "overflow-hidden"}>
        <div
          className={`hidden items-center gap-3 border-b border-white/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-mist sm:grid ${gridCols}`}
        >
          <span>App</span>
          <span>Installs</span>
          <span>Rating</span>
          {showAge ? <span>Age</span> : null}
          <span>Category</span>
          <span className="sr-only">Play Store</span>
        </div>
        <div className="divide-y divide-white/8">
          {visible.map((app) => {
            const installs = installsValue(app);
            const age = ageValue(app);
            const genre = genreValue(app);
            const rating = ratingValue(app);
            const shots = Array.isArray(app.screenshots) ? app.screenshots.filter(Boolean) : [];
            const open = Boolean(mediaOpen[app.appId]);
            return (
              <div key={app.appId} className="px-3 py-2.5">
                <div className={`grid items-center gap-2 sm:gap-3 ${gridCols}`}>
                  <Link
                    href={`/apps/${encodeURIComponent(app.appId)}`}
                    className="flex min-w-0 items-center gap-2.5 hover:text-mint"
                  >
                    <AppIcon src={app.icon} className="h-9 w-9 rounded-xl" />
                    <span className="min-w-0">
                      {showAccountSubtitle ? (
                        <span className="block truncate text-[11px] leading-4 text-mist">{accountName}</span>
                      ) : null}
                      <span className="block truncate text-sm font-medium leading-5">{app.title}</span>
                    </span>
                  </Link>
                  <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 text-xs text-mist sm:col-span-1 sm:contents sm:pl-0">
                    <MetricCell label="Installs" value={installs} className="tabular-nums sm:text-sm sm:text-foam" />
                    <span className="inline-flex items-center gap-1 text-sand sm:text-sm">
                      <span className="text-[10px] uppercase tracking-wide text-mist/80 sm:hidden">Rating</span>
                      {app.score != null ? <Star className="h-3 w-3 fill-current" /> : null}
                      {rating}
                    </span>
                    {showAge ? (
                      <MetricCell
                        label="Age"
                        value={age}
                        title={app.released || undefined}
                        className="tabular-nums sm:text-sm sm:text-foam"
                      />
                    ) : null}
                    <MetricCell
                      label="Category"
                      value={genre}
                      className="max-w-[9rem] truncate sm:max-w-none sm:text-sm sm:text-foam"
                    />
                    <span className="ml-auto inline-flex items-center gap-1 sm:ml-0 sm:justify-self-end">
                      {showScreenshots && shots.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setMediaOpen((prev) => ({ ...prev, [app.appId]: !prev[app.appId] }))
                          }
                          className="rounded-lg px-1.5 py-1 text-[11px] text-mist hover:bg-white/8 hover:text-foam"
                          aria-expanded={open}
                          aria-label={open ? "Hide screenshots" : "Show screenshots"}
                        >
                          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      ) : null}
                      <PlayStoreLink href={playUrl(app.appId, country)} label={`Open ${app.title} on Play Store`} />
                    </span>
                  </div>
                </div>
                {showScreenshots && open && shots.length > 0 ? (
                  <div className="mt-2 pl-0 sm:pl-11">
                    <ScreenshotScroller urls={shots} title="" imageClassName="h-32" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
