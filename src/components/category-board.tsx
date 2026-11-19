"use client";

import { AppIcon } from "@/components/app-icon";
import { ConceptChart } from "@/components/concept-chart";
import { PlayStoreLink } from "@/components/play-store-link";
import { ScreenshotScroller } from "@/components/screenshot-scroller";
import { useStorefront } from "@/components/storefront";
import { AppCard } from "@/components/ui";
import { useWatchlist } from "@/components/watchlist-context";
import type { AppDetails, TrackedApp } from "@/lib/playstore/types";
import { getCategoryLastReload, setCategoryLastReload } from "@/lib/sync/category-reload-meta";
import { reloadAppCategory } from "@/lib/sync/reload-category";
import { appConcept } from "@/lib/app-concept";
import { openPlayListings, openTabsMessage } from "@/lib/open-play-tabs";
import { formatNumber, formatScore, playUrl } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, LayoutGrid, List, Pencil, RefreshCw, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_CREATED_EVENT,
  type CategoryCreatedDetail,
} from "@/components/create-category-control";

type Filter = "all" | string;
type AppListView = "normal" | "details";

const VIEW_KEY = "track-dashboard-app-list-view-v1";

export function CategoryBoard() {
  const { qs, country } = useStorefront();
  const {
    data,
    ready,
    updateCategory,
    deleteCategory,
    setAppCategory,
    untrackAppLocal,
    markAppUnpublishedLocal,
    applyAppSnapshot,
  } = useWatchlist();
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState("");
  const [reloading, setReloading] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastReloadAt, setLastReloadAt] = useState<number | null>(null);
  const [view, setView] = useState<AppListView>("normal");
  const [concept, setConcept] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "details" || saved === "normal") setView(saved);
  }, []);

  function setListView(next: AppListView) {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  }

  const liveApps = useMemo(() => {
    const removed = new Set(data.removedApps.map((app) => app.appId));
    return data.apps.filter((app) => !removed.has(app.appId));
  }, [data.apps, data.removedApps]);

  const selectedCategory = filter !== "all" ? data.categories.find((c) => c.id === filter) : null;

  const visibleApps = useMemo(() => {
    if (filter === "all") return liveApps;
    return liveApps.filter((a) => a.categoryId === filter);
  }, [liveApps, filter]);

  const listedApps = useMemo(() => {
    if (!concept) return visibleApps;
    return visibleApps.filter((app) => appConcept(app.title) === concept);
  }, [visibleApps, concept]);

  useEffect(() => {
    setConcept(null);
  }, [filter]);

  const addableApps =
    selectedCategory ? liveApps.filter((a) => a.categoryId !== selectedCategory.id) : [];

  useEffect(() => {
    if (!selectedCategory) {
      setLastReloadAt(null);
      return;
    }
    setLastReloadAt(getCategoryLastReload("app", selectedCategory.id));
  }, [selectedCategory?.id]);

  useEffect(() => {
    function onCreated(event: Event) {
      const detail = (event as CustomEvent<CategoryCreatedDetail>).detail;
      if (detail?.kind === "app" && detail.id) setFilter(detail.id);
    }
    window.addEventListener(CATEGORY_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(CATEGORY_CREATED_EVENT, onCreated);
  }, []);

  async function forceReloadCategory() {
    if (!selectedCategory || reloading) return;
    const targets = liveApps.filter((a) => a.categoryId === selectedCategory.id);
    if (targets.length === 0) {
      setMessage("No apps in this category to reload.");
      return;
    }
    setReloading(true);
    setMessage("");
    setProgress(`0 / ${targets.length}`);
    try {
      const result = await reloadAppCategory(
        qs,
        targets,
        { applyAppSnapshot, markAppUnpublishedLocal },
        (done, total, label) => {
          setProgress(label ? `${done + 1} / ${total} · ${label}` : `${done} / ${total}`);
        },
      );
      const ts = Date.now();
      setCategoryLastReload("app", selectedCategory.id, ts);
      setLastReloadAt(ts);
      const parts = [`Reloaded ${result.ok} of ${result.total} apps in “${selectedCategory.name}”.`];
      if (result.removed) {
        parts.push(
          `Marked ${result.removed} app${result.removed === 1 ? "" : "s"} unpublished (still on App Tracking).`,
        );
      }
      if (result.failed) parts.push(`${result.failed} skipped (flaky Play response).`);
      if (result.errors[0]) parts.push(result.errors[0]);
      setMessage(parts.join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Force reload failed");
    } finally {
      setReloading(false);
      setProgress("");
    }
  }

  function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const ok = updateCategory(editingId, editName);
    if (!ok) {
      setMessage("That name is empty or already used.");
      return;
    }
    setEditingId(null);
    setMessage("");
  }

  function removeCategory(id: string, name: string) {
    if (!window.confirm(`Delete category “${name}”? Apps stay tracked.`)) return;
    deleteCategory(id);
    if (filter === id) setFilter("all");
  }

  function openTheseApps() {
    const result = openPlayListings(
      visibleApps.map((app) => app.appId),
      country,
    );
    const text = openTabsMessage(result);
    if (text) setMessage(text);
  }

  function openConceptApps() {
    if (!concept) return;
    const result = openPlayListings(
      visibleApps.filter((app) => appConcept(app.title) === concept).map((app) => app.appId),
      country,
    );
    const text = openTabsMessage(result);
    if (text) setMessage(text);
  }

  if (!ready) return <p className="text-sm text-mist">Loading saved apps…</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${liveApps.length})`} />
        {data.categories.map((cat) => {
          const count = liveApps.filter((a) => a.categoryId === cat.id).length;
          return (
            <FilterChip
              key={cat.id}
              active={filter === cat.id}
              onClick={() => setFilter(cat.id)}
              label={`${cat.name} (${count})`}
            />
          );
        })}
        <div className="ml-auto flex rounded-full bg-white/8 p-1" role="group" aria-label="App list view">
          <ViewChip
            active={view === "normal"}
            onClick={() => setListView("normal")}
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Normal"
          />
          <ViewChip
            active={view === "details"}
            onClick={() => setListView("details")}
            icon={<List className="h-3.5 w-3.5" />}
            label="Details"
          />
        </div>
      </div>

      {message ? <p className="mb-4 text-sm text-sand">{message}</p> : null}

      {selectedCategory ? (
        <div className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
          {editingId === selectedCategory.id ? (
            <form onSubmit={saveRename} className="flex flex-wrap items-center gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-10 rounded-xl border border-white/15 bg-[#0d1b26] px-3"
                autoFocus
              />
              <button className="rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-ink">Save</button>
              <button type="button" className="text-sm text-mist" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              <h3 className="text-lg font-semibold">{selectedCategory.name}</h3>
              <button
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-3 py-1.5 text-sm"
                onClick={() => {
                  setEditingId(selectedCategory.id);
                  setEditName(selectedCategory.name);
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-3 py-1.5 text-sm text-[#ff8b8b]"
                onClick={() => removeCategory(selectedCategory.id, selectedCategory.name)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button
                type="button"
                disabled={reloading || visibleApps.length === 0}
                onClick={() => void forceReloadCategory()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-mint px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
                {reloading ? `Reloading… ${progress}` : "Force reload"}
              </button>
              <button
                type="button"
                disabled={visibleApps.length === 0}
                onClick={openTheseApps}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-sm font-semibold"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open all on Play
              </button>
            </>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {lastReloadAt ? (
              <p className="text-xs text-mist">
                Last reload {formatDistanceToNow(lastReloadAt, { addSuffix: true })}
              </p>
            ) : (
              <p className="text-xs text-mist">No force reload yet — use daily for this category</p>
            )}
            {addableApps.length > 0 ? (
              <select
                className="h-10 rounded-xl border border-white/10 bg-[#0d1b26] px-3 text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setAppCategory(e.target.value, selectedCategory.id);
                  e.target.value = "";
                }}
              >
                <option value="">Add app to this category</option>
                {addableApps.map((app) => (
                  <option key={app.appId} value={app.appId}>
                    {app.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}

      {visibleApps.length > 0 ? (
        <ConceptChart
          titles={visibleApps.map((app) => app.title)}
          heading={selectedCategory ? `${selectedCategory.name} concepts` : "Tracked app concepts"}
          hint="Click a bar to list only those apps, then Open all on Play. Click the bar again, or Show all apps, to clear it."
          selected={concept}
          onSelect={setConcept}
          onOpen={openConceptApps}
        />
      ) : null}

      {liveApps.length === 0 ? (
        <p className="panel px-6 py-10 text-center text-sm text-mist">
          No apps tracked yet. Search above, then click Track.
        </p>
      ) : visibleApps.length === 0 ? (
        <p className="panel px-6 py-10 text-center text-sm text-mist">
          No apps in this category. Use “Add app to this category” or move an app with the dropdown on its card.
        </p>
      ) : (
        <div
          className={
            view === "normal"
              ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3"
              : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          }
        >
          {listedApps.map((app) => (
            <TrackedAppManageCard
              key={app.appId}
              app={app}
              categories={data.categories}
              view={view}
              onCategory={(id) => setAppCategory(app.appId, id)}
              onUntrack={() => untrackAppLocal(app.appId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-mint px-3 py-1.5 text-sm font-semibold text-ink"
          : "rounded-full bg-white/8 px-3 py-1.5 text-sm text-mist hover:text-foam"
      }
    >
      {label}
    </button>
  );
}

function ViewChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1.5 text-sm font-semibold text-ink"
          : "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-mist hover:text-foam"
      }
    >
      {icon}
      {label}
    </button>
  );
}

function TrackedAppManageCard({
  app,
  categories,
  view,
  onCategory,
  onUntrack,
}: {
  app: TrackedApp;
  categories: { id: string; name: string }[];
  view: AppListView;
  onCategory: (id: string | null) => void;
  onUntrack: () => void;
}) {
  const { qs, country } = useStorefront();
  const { applyAppSnapshot } = useWatchlist();
  const [loading, setLoading] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const last = app.snapshots.at(-1);
  const genre = app.genre ?? last?.genre ?? null;
  const installs = last?.installs ?? (last?.maxInstalls != null ? formatNumber(last.maxInstalls) : null);
  const score = last?.score ?? null;
  const version = last?.version ?? null;
  const updated = last?.updated ?? null;
  const ratings = last?.ratings ?? null;
  const reviews = last?.reviews ?? null;

  useEffect(() => {
    if (view !== "details") return;
    let cancelled = false;
    async function loadDetails() {
      setLoading(true);
      try {
        const res = await fetch(`/api/apps/${encodeURIComponent(app.appId)}?${qs}`);
        const data = await res.json();
        if (cancelled || !res.ok || !data.app) return;
        const live = data.app as AppDetails;
        applyAppSnapshot(live);
        if (!cancelled) setScreenshots(Array.isArray(live.screenshots) ? live.screenshots.filter(Boolean) : []);
      } catch {
        /* keep snapshot */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDetails();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.appId, qs, view]);

  if (view === "normal") {
    return (
      <div className="panel overflow-hidden">
        <AppCard
          className="rounded-none border-0 bg-transparent shadow-none hover:border-transparent"
          playLink={false}
          app={{
            appId: app.appId,
            title: app.title,
            icon: app.icon,
            score,
            free: true,
            developer: app.developer,
            developerId: app.developerId,
            installs: installs ?? undefined,
            genre: genre ?? undefined,
          }}
        />
        {app.listingStatus === "unpublished" ? (
          <div className="border-t border-white/8 px-4 py-2">
            <span className="rounded-full bg-[#ffb020]/18 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#ffb020]">
              Unpublished on Play
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-4 py-3">
          <select
            value={app.categoryId ?? ""}
            onChange={(e) => onCategory(e.target.value || null)}
            className="h-9 flex-1 rounded-xl border border-white/10 bg-[#0d1b26] px-2 text-sm"
            aria-label="Category"
          >
            <option value="">Choose category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <PlayStoreLink href={playUrl(app.appId, country)} label={`Open ${app.title} on Play Store`} />
          <button type="button" onClick={onUntrack} className="text-xs text-mist hover:text-[#ff8b8b]">
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/8 p-4">
        <Link
          href={`/apps/${encodeURIComponent(app.appId)}`}
          className="flex min-w-0 flex-1 items-center gap-3 hover:text-mint"
        >
          <AppIcon src={app.icon} className="h-12 w-12 rounded-2xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-lg font-semibold">{app.title}</p>
              {app.listingStatus === "unpublished" ? (
                <span className="shrink-0 rounded-full bg-[#ffb020]/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ffb020]">
                  Unpublished
                </span>
              ) : null}
            </div>
            <p className="truncate text-sm text-mist">{app.developer}</p>
          </div>
        </Link>
        <PlayStoreLink href={playUrl(app.appId, country)} label={`Open ${app.title} on Play Store`} />
      </div>

      <div className="grid gap-2 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !last ? (
          <p className="text-sm text-mist sm:col-span-2 lg:col-span-3">Loading listing details…</p>
        ) : (
          <>
            <DetailStat
              label="Score"
              value={
                score != null ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-current text-sand" />
                    {formatScore(score)}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <DetailStat label="Installs" value={installs || "—"} />
            <DetailStat label="Genre" value={genre || "—"} />
            <DetailStat label="Ratings" value={ratings != null ? formatNumber(ratings) : "—"} />
            <DetailStat label="Reviews" value={reviews != null ? formatNumber(reviews) : "—"} />
            <DetailStat label="Version" value={version || "—"} />
            <DetailStat
              label="Updated"
              value={
                updated
                  ? formatDistanceToNow(updated, { addSuffix: true })
                  : "—"
              }
            />
            <DetailStat
              label="Snapshots"
              value={String(app.snapshots.length)}
            />
            <DetailStat
              label="Tracked"
              value={formatDistanceToNow(app.addedAt, { addSuffix: true })}
            />
          </>
        )}
      </div>

      {loading && screenshots.length === 0 ? (
        <p className="border-t border-white/8 px-4 py-3 text-xs text-mist">Loading screenshots…</p>
      ) : screenshots.length > 0 ? (
        <div className="border-t border-white/8 px-4 py-3">
          <ScreenshotScroller urls={screenshots} imageClassName="h-40" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-4 py-3">
        <select
          value={app.categoryId ?? ""}
          onChange={(e) => onCategory(e.target.value || null)}
          className="h-9 flex-1 rounded-xl border border-white/10 bg-[#0d1b26] px-2 text-sm"
          aria-label="Category"
        >
          <option value="">Choose category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={onUntrack} className="text-xs text-mist hover:text-[#ff8b8b]">
          Remove
        </button>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/4 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-mist">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foam">{value}</p>
    </div>
  );
}
