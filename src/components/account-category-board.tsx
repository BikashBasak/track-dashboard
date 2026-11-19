"use client";

import { AccountAppList } from "@/components/account-app-list";
import { AppIcon } from "@/components/app-icon";
import { ConceptChart } from "@/components/concept-chart";
import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { useWatchlist } from "@/components/watchlist-context";
import type { AppSummary, TrackedAccount } from "@/lib/playstore/types";
import { getCategoryLastReload, setCategoryLastReload } from "@/lib/sync/category-reload-meta";
import { reloadAccountCategory } from "@/lib/sync/reload-category";
import { appConcept } from "@/lib/app-concept";
import { openPlayListings, openTabsMessage, openUrls } from "@/lib/open-play-tabs";
import { developerPlayUrl, formatNumber } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, LayoutGrid, List, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CATEGORY_CREATED_EVENT,
  type CategoryCreatedDetail,
} from "@/components/create-category-control";

type Filter = "all" | string;
type AccountListView = "normal" | "details";

const VIEW_KEY = "track-dashboard-account-list-view-v1";

export function AccountCategoryBoard() {
  const { qs, country } = useStorefront();
  const {
    data,
    ready,
    updateAccountCategory,
    deleteAccountCategory,
    setAccountCategory,
    untrackAccountLocal,
    applyAccountSnapshot,
    applyAppSnapshot,
    applyAppSnapshotSilent,
    markAppUnpublishedLocal,
    getTrackedApp,
    getTrackedAccount,
    rememberAccountListings,
    rememberAccountCatalog,
    archivePlayRemovedApp,
  } = useWatchlist();
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<AccountListView>("normal");
  const [reloading, setReloading] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastReloadAt, setLastReloadAt] = useState<number | null>(null);
  const [concept, setConcept] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "details" || saved === "normal") setView(saved);
  }, []);

  function setListView(next: AccountListView) {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  }

  const liveAccounts = useMemo(() => {
    const removed = new Set(data.removedAccounts.map((acc) => acc.developerId));
    return data.accounts.filter((acc) => !removed.has(acc.developerId));
  }, [data.accounts, data.removedAccounts]);

  const selectedCategory = filter !== "all" ? data.accountCategories.find((c) => c.id === filter) : null;

  const visibleAccounts = useMemo(() => {
    if (filter === "all") return liveAccounts;
    return liveAccounts.filter((a) => a.categoryId === filter);
  }, [liveAccounts, filter]);

  const addableAccounts =
    selectedCategory ? liveAccounts.filter((a) => a.categoryId !== selectedCategory.id) : [];

  useEffect(() => {
    if (!selectedCategory) {
      setLastReloadAt(null);
      return;
    }
    setLastReloadAt(getCategoryLastReload("account", selectedCategory.id));
  }, [selectedCategory?.id]);

  useEffect(() => {
    function onCreated(event: Event) {
      const detail = (event as CustomEvent<CategoryCreatedDetail>).detail;
      if (detail?.kind === "account" && detail.id) setFilter(detail.id);
    }
    window.addEventListener(CATEGORY_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(CATEGORY_CREATED_EVENT, onCreated);
  }, []);

  async function forceReloadCategory() {
    if (!selectedCategory || reloading) return;
    const targets = liveAccounts.filter((a) => a.categoryId === selectedCategory.id);
    if (targets.length === 0) {
      setMessage("No publishers in this category to reload.");
      return;
    }
    setReloading(true);
    setMessage("");
    setProgress(`0 / ${targets.length}`);
    try {
      const result = await reloadAccountCategory(
        qs,
        targets,
        {
          applyAccountSnapshot,
          untrackAccountLocal,
          applyAppSnapshot,
          applyAppSnapshotSilent,
          markAppUnpublishedLocal,
          getTrackedApp,
          getTrackedAccount,
          rememberAccountListings,
          rememberAccountCatalog,
          archivePlayRemovedApp,
        },
        (done, total, label) => {
          setProgress(label ? `${done + 1} / ${total} · ${label}` : `${done} / ${total}`);
        },
      );
      const ts = Date.now();
      setCategoryLastReload("account", selectedCategory.id, ts);
      setLastReloadAt(ts);
      const parts = [`Reloaded ${result.ok} of ${result.total} accounts in “${selectedCategory.name}”.`];
      if (result.appsChecked) {
        parts.push(`Checked ${result.appsChecked} catalog app listing${result.appsChecked === 1 ? "" : "s"}.`);
      }
      if (result.alerts) {
        parts.push(`${result.alerts} notification${result.alerts === 1 ? "" : "s"} added.`);
      }
      if (result.removed) {
        parts.push(
          `Removed ${result.removed} gone account${result.removed === 1 ? "" : "s"} from Account Tracking.`,
        );
      }
      if (result.appsRemoved) {
        parts.push(
          `Removed ${result.appsRemoved} gone app${result.appsRemoved === 1 ? "" : "s"} from the catalog.`,
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
    const ok = updateAccountCategory(editingId, editName);
    if (!ok) {
      setMessage("That name is empty or already used.");
      return;
    }
    setEditingId(null);
    setMessage("");
  }

  function removeCategory(id: string, name: string) {
    if (!window.confirm(`Delete category “${name}”? Publishers stay tracked.`)) return;
    deleteAccountCategory(id);
    if (filter === id) setFilter("all");
  }

  function openTheseAccounts() {
    const result = openUrls(
      visibleAccounts.map((account) => developerPlayUrl(account.developerId)),
      "account",
    );
    const text = openTabsMessage(result);
    if (text) setMessage(text);
  }

  const conceptTitles = visibleAccounts.flatMap((account) =>
    (account.catalog ?? []).map((app) => app.title).filter(Boolean),
  );

  const catalogApps = useMemo(() => {
    const seen = new Set<string>();
    const apps: AppSummary[] = [];
    for (const account of visibleAccounts) {
      for (const app of account.catalog ?? []) {
        if (!app.appId || seen.has(app.appId)) continue;
        seen.add(app.appId);
        apps.push(app);
      }
    }
    return apps;
  }, [visibleAccounts]);

  const listedCatalog = useMemo(() => {
    if (!concept) return catalogApps;
    return catalogApps.filter((app) => appConcept(app.title) === concept);
  }, [catalogApps, concept]);

  useEffect(() => {
    setConcept(null);
  }, [filter]);

  if (!ready) return <p className="text-sm text-mist">Loading saved publishers…</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`All (${liveAccounts.length})`}
        />
        {data.accountCategories.map((cat) => {
          const count = liveAccounts.filter((a) => a.categoryId === cat.id).length;
          return (
            <FilterChip
              key={cat.id}
              active={filter === cat.id}
              onClick={() => setFilter(cat.id)}
              label={`${cat.name} (${count})`}
            />
          );
        })}
        <div className="ml-auto flex rounded-full bg-white/8 p-1" role="group" aria-label="Account list view">
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
                disabled={reloading || visibleAccounts.length === 0}
                onClick={() => void forceReloadCategory()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-mint px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
                {reloading ? `Reloading… ${progress}` : "Force reload"}
              </button>
              <button
                type="button"
                disabled={visibleAccounts.length === 0}
                onClick={openTheseAccounts}
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
            {addableAccounts.length > 0 ? (
              <select
                className="h-10 rounded-xl border border-white/10 bg-[#0d1b26] px-3 text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setAccountCategory(e.target.value, selectedCategory.id);
                  e.target.value = "";
                }}
              >
                <option value="">Add publisher to this category</option>
                {addableAccounts.map((acc) => (
                  <option key={acc.developerId} value={acc.developerId}>
                    {acc.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}

      {visibleAccounts.length > 0 && conceptTitles.length > 0 ? (
        <ConceptChart
          titles={conceptTitles}
          heading={selectedCategory ? `${selectedCategory.name} concepts` : "Uploaded app concepts"}
          hint="Click a bar to list only those apps, then Open all on Play. Click the bar again, or Show all apps, to clear it."
          selected={concept}
          onSelect={setConcept}
          onOpen={() => {
            const result = openPlayListings(
              listedCatalog.map((app) => app.appId),
              country,
            );
            const text = openTabsMessage(result);
            if (text) setMessage(text);
          }}
        />
      ) : visibleAccounts.length > 0 ? (
        <p className="panel mb-5 px-4 py-3 text-sm text-mist">
          Concept chart appears after a publisher’s app list is saved. Open Details on a card once, then come back.
        </p>
      ) : null}

      {liveAccounts.length === 0 ? (
        <p className="panel px-6 py-10 text-center text-sm text-mist">
          No publishers tracked yet. Search a publisher above and click Track.
        </p>
      ) : visibleAccounts.length === 0 ? (
        <p className="panel px-6 py-10 text-center text-sm text-mist">
          No publishers in this category. Use “Add publisher to this category” or move one with the dropdown on its
          card.
        </p>
      ) : concept ? (
        <div className="panel overflow-hidden">
          <AccountAppList apps={listedCatalog} framed={false} sort="installs" compact />
        </div>
      ) : (
        <div
          className={
            view === "normal"
              ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3"
              : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          }
        >
          {visibleAccounts.map((acc) => (
            <TrackedAccountManageCard
              key={acc.developerId}
              account={acc}
              categories={data.accountCategories}
              view={view}
              onCategory={(id) => setAccountCategory(acc.developerId, id)}
              onUntrack={() => untrackAccountLocal(acc.developerId)}
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

function TrackedAccountManageCard({
  account,
  categories,
  view,
  onCategory,
  onUntrack,
}: {
  account: TrackedAccount;
  categories: { id: string; name: string }[];
  view: AccountListView;
  onCategory: (id: string | null) => void;
  onUntrack: () => void;
}) {
  const { qs } = useStorefront();
  const { rememberAccountCatalog } = useWatchlist();
  const [loadingApps, setLoadingApps] = useState(view === "details" && !account.catalog?.length);
  const last = account.snapshots.at(-1);
  const apps = account.catalog ?? [];
  const catalogInstalls = apps.reduce((sum, app) => sum + (app.maxInstalls ?? app.minInstalls ?? 0), 0);
  const installFootprint = catalogInstalls || last?.totalMinInstalls || 0;
  const appCount = apps.length || account.appCount || 0;

  useEffect(() => {
    if (view !== "details") return;
    let cancelled = false;
    async function loadCatalog() {
      if (!account.catalog?.length) setLoadingApps(true);
      try {
        const res = await fetch(`/api/developers/${encodeURIComponent(account.developerId)}?${qs}&mergeMarkets=1`);
        const data = await res.json();
        if (cancelled || !res.ok || !Array.isArray(data.apps)) return;
        rememberAccountCatalog(account.developerId, data.apps, data.name);
      } catch {
        /* keep any saved catalog */
      } finally {
        if (!cancelled) setLoadingApps(false);
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
    // Refresh once per account / storefront; do not depend on rememberAccountCatalog identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.developerId, qs, view]);

  return (
    <div className="panel overflow-hidden">
      <div className={`flex items-center gap-3 p-4 ${view === "details" ? "border-b border-white/8" : ""}`}>
        <Link
          href={`/accounts/${encodeURIComponent(account.developerId)}`}
          className="flex min-w-0 flex-1 items-center gap-3 hover:text-mint"
        >
          {account.sampleIcon ? (
            <AppIcon src={account.sampleIcon} className="h-12 w-12 rounded-2xl" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{account.name}</p>
            {view === "details" ? (
              <p className="text-sm text-mist">
                {appCount} apps
                {installFootprint ? ` · ${formatNumber(installFootprint)} installs` : ""}
              </p>
            ) : null}
          </div>
        </Link>
        <PlayStoreLink href={developerPlayUrl(account.developerId)} label={`Open ${account.name} on Play Store`} />
      </div>
      {view === "details" ? (
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto soft-scroll">
          {loadingApps && apps.length === 0 ? (
            <p className="px-4 py-6 text-sm text-mist">Loading {account.name} apps…</p>
          ) : (
            <AccountAppList
              apps={apps}
              framed={false}
              sort="installs"
              compact
              onHydrated={(hydrated) => rememberAccountCatalog(account.developerId, hydrated, account.name)}
            />
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-4 py-3">
        <select
          value={account.categoryId ?? ""}
          onChange={(e) => onCategory(e.target.value || null)}
          className="h-9 flex-1 rounded-xl border border-white/10 bg-[#0d1b26] px-2 text-sm"
          aria-label="Account category"
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
