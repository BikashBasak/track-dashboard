"use client";

import { AppIcon } from "@/components/app-icon";
import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { PageHeader } from "@/components/ui";
import { useWatchlist } from "@/components/watchlist-context";
import type { RemovedAccount, RemovedApp } from "@/lib/playstore/types";
import { checkPlayPresence, goneIds, liveIds } from "@/lib/sync/check";
import { developerPlayUrl, formatNumber, playUrl } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type Filter = "all" | "untracked" | "play-removed" | "live";

export function RemovedBoard({ kind }: { kind: "app" | "account" }) {
  const { qs } = useStorefront();
  const watch = useWatchlist();
  const [filter, setFilter] = useState<Filter>("all");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  const items = kind === "app" ? watch.data.removedApps : watch.data.removedAccounts;
  const trackedCount = kind === "app" ? watch.data.apps.length : watch.data.accounts.length;

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (filter === "untracked") return item.reason === "untracked" && item.playStatus !== "live";
      if (filter === "play-removed") return item.reason === "play-removed" || item.playStatus === "gone";
      if (filter === "live") return item.playStatus === "live";
      return true;
    });
  }, [items, filter]);

  async function checkBatch(appIds: string[], developerIds: string[]) {
    const foundGone: { apps: string[]; accounts: string[] } = { apps: [], accounts: [] };
    const foundLive: { apps: string[]; accounts: string[] } = { apps: [], accounts: [] };
    const ids = kind === "app" ? appIds : developerIds;
    for (let i = 0; i < ids.length; i += 4) {
      const chunk = ids.slice(i, i + 4);
      const data = await checkPlayPresence(
        qs,
        kind === "app" ? { appIds: chunk } : { developerIds: chunk },
      );
      foundLive.apps.push(...liveIds(data.apps));
      foundGone.apps.push(...goneIds(data.apps));
      foundLive.accounts.push(...liveIds(data.accounts));
      foundGone.accounts.push(...goneIds(data.accounts));
    }
    return { foundGone, foundLive };
  }

  async function scanTracked() {
    setScanning(true);
    setMessage("");
    try {
      const ids = kind === "app" ? watch.data.apps.map((a) => a.appId) : watch.data.accounts.map((a) => a.developerId);
      if (ids.length === 0) {
        setMessage("Nothing is tracked yet. Track apps or publishers first, then scan.");
        return;
      }
      const { foundGone } = await checkBatch(
        kind === "app" ? ids : [],
        kind === "account" ? ids : [],
      );
      const gone = kind === "app" ? foundGone.apps : foundGone.accounts;
      for (const id of gone) {
        if (kind === "app") watch.untrackAppLocal(id, "play-removed");
        else watch.untrackAccountLocal(id, "play-removed");
      }
      setMessage(
        gone.length
          ? `Moved ${gone.length} ${kind === "app" ? "app(s)" : "account(s)"} that Play no longer lists.`
          : `All ${ids.length} tracked ${kind === "app" ? "apps" : "accounts"} are still on Play.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function recheckOne(id: string) {
    const { foundGone, foundLive } = await checkBatch(kind === "app" ? [id] : [], kind === "account" ? [id] : []);
    const live = kind === "app" ? foundLive.apps.includes(id) : foundLive.accounts.includes(id);
    const gone = kind === "app" ? foundGone.apps.includes(id) : foundGone.accounts.includes(id);
    if (kind === "app") watch.setRemovedAppPlayStatus(id, live ? "live" : gone ? "gone" : "unknown");
    else watch.setRemovedAccountPlayStatus(id, live ? "live" : gone ? "gone" : "unknown");
  }

  function clearAll() {
    const noun = kind === "app" ? "apps" : "accounts";
    if (items.length === 0) return;
    if (
      !window.confirm(
        `Delete all ${items.length} removed ${noun} forever? This cannot be undone.`,
      )
    ) {
      return;
    }
    if (kind === "app") watch.clearRemovedApps();
    else watch.clearRemovedAccounts();
    setMessage(`Cleared ${items.length} removed ${noun}.`);
  }

  if (!watch.ready) return <p className="text-sm text-mist">Loading removed items…</p>;

  return (
    <div>
      <PageHeader
        eyebrow="Module · Live"
        title={kind === "app" ? "Remove App" : "Remove Account"}
        description={
          kind === "app"
            ? "Apps you remove from tracking land here, with last snapshots. Scan tracked apps to catch Play Store takedowns — same job as AsoSpy’s Remove App list, using public Play listings."
            : "Publishers you remove from tracking land here. Scan tracked accounts to catch developer pages Play no longer lists."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void scanTracked()}
              disabled={scanning || trackedCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {scanning ? "Scanning Play…" : `Scan ${trackedCount} tracked`}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={items.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-[#ff8b8b]/40 px-4 py-2 text-sm font-semibold text-[#ff8b8b] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <TabLink href="/removed/apps" active={kind === "app"} label={`Remove App (${watch.data.removedApps.length})`} />
        <TabLink
          href="/removed/accounts"
          active={kind === "account"}
          label={`Remove Account (${watch.data.removedAccounts.length})`}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${items.length})`} />
        <Chip
          active={filter === "untracked"}
          onClick={() => setFilter("untracked")}
          label={`Untracked (${items.filter((i) => i.reason === "untracked" && i.playStatus !== "live").length})`}
        />
        <Chip
          active={filter === "play-removed"}
          onClick={() => setFilter("play-removed")}
          label={`Play takedown (${items.filter((i) => i.reason === "play-removed" || i.playStatus === "gone").length})`}
        />
        <Chip
          active={filter === "live"}
          onClick={() => setFilter("live")}
          label={`Back on Play (${items.filter((i) => i.playStatus === "live").length})`}
        />
      </div>
      {message ? <p className="mb-4 text-sm text-sand">{message}</p> : null}

      {visible.length === 0 ? (
        <p className="panel px-6 py-10 text-center text-sm text-mist">
          {kind === "app"
            ? "No removed apps yet. Use Remove on a tracked app, or scan tracked apps for Play takedowns."
            : "No removed accounts yet. Use Remove on a tracked publisher, or scan tracked accounts for Play takedowns."}
        </p>
      ) : (
        <div className="grid gap-3">
          {visible.map((item) =>
            kind === "app" ? (
              <RemovedAppCard
                key={(item as RemovedApp).appId}
                item={item as RemovedApp}
                categoryName={watch.data.categories.find((c) => c.id === item.categoryId)?.name}
                onRestore={() => watch.restoreRemovedApp((item as RemovedApp).appId)}
                onDelete={() => {
                  if (window.confirm("Delete this removed app forever? This cannot be undone.")) {
                    watch.deleteRemovedApp((item as RemovedApp).appId);
                  }
                }}
                onRecheck={() => void recheckOne((item as RemovedApp).appId)}
              />
            ) : (
              <RemovedAccountCard
                key={(item as RemovedAccount).developerId}
                item={item as RemovedAccount}
                categoryName={watch.data.accountCategories.find((c) => c.id === item.categoryId)?.name}
                onRestore={() => watch.restoreRemovedAccount((item as RemovedAccount).developerId)}
                onDelete={() => {
                  if (window.confirm("Delete this removed account forever? This cannot be undone.")) {
                    watch.deleteRemovedAccount((item as RemovedAccount).developerId);
                  }
                }}
                onRecheck={() => void recheckOne((item as RemovedAccount).developerId)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-mint px-4 py-1.5 text-sm font-semibold text-ink"
          : "rounded-full bg-white/8 px-4 py-1.5 text-sm text-mist hover:text-foam"
      }
    >
      {label}
    </Link>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-white/12 px-3 py-1.5 text-sm text-foam"
          : "rounded-full bg-white/6 px-3 py-1.5 text-sm text-mist hover:text-foam"
      }
    >
      {label}
    </button>
  );
}

function statusLabel(item: { reason: string; playStatus?: string }) {
  if (item.playStatus === "live") return { text: "Back on Play", tone: "good" as const };
  if (item.reason === "play-removed" || item.playStatus === "gone") {
    return { text: "Removed from Play", tone: "bad" as const };
  }
  return { text: "Untracked", tone: "muted" as const };
}

function RemovedAppCard({
  item,
  categoryName,
  onRestore,
  onDelete,
  onRecheck,
}: {
  item: RemovedApp;
  categoryName?: string;
  onRestore: () => void;
  onDelete: () => void;
  onRecheck: () => void;
}) {
  const { country } = useStorefront();
  const last = item.snapshots.at(-1);
  const status = statusLabel(item);
  return (
    <div className="panel flex flex-wrap items-center gap-4 p-4">
      <AppIcon src={item.icon} className="h-12 w-12 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <Link href={`/apps/${encodeURIComponent(item.appId)}`} className="font-semibold hover:text-mint">
          {item.title}
        </Link>
        <p className="text-sm text-mist">
          {item.developer}
          {last?.installs ? ` · ${last.installs}` : ""}
          {last?.score != null ? ` · ${last.score.toFixed(2)}` : ""}
          {categoryName ? ` · ${categoryName}` : ""}
        </p>
        <p className="text-xs text-mist">
          Removed {formatDistanceToNow(item.removedAt, { addSuffix: true })} · {item.snapshots.length} snapshots
        </p>
      </div>
      <span
        className={
          status.tone === "bad"
            ? "rounded-full bg-[#ff8b8b]/15 px-2.5 py-1 text-xs text-[#ff8b8b]"
            : status.tone === "good"
              ? "rounded-full bg-mint/15 px-2.5 py-1 text-xs text-mint"
              : "rounded-full bg-white/8 px-2.5 py-1 text-xs text-mist"
        }
      >
        {status.text}
      </span>
      <PlayStoreLink href={playUrl(item.appId, country)} label={`Open ${item.title} on Play Store`} />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRestore}
          className="inline-flex items-center gap-1 rounded-xl bg-mint px-3 py-1.5 text-xs font-semibold text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restore
        </button>
        <button onClick={onRecheck} className="rounded-xl border border-white/15 px-3 py-1.5 text-xs">
          Recheck Play
        </button>
        {item.developerId ? (
          <Link
            href={`/accounts/${encodeURIComponent(item.developerId)}`}
            className="rounded-xl border border-white/15 px-3 py-1.5 text-xs"
          >
            Publisher
          </Link>
        ) : null}
        <Link
          href={`/apps/${encodeURIComponent(item.appId)}`}
          className="rounded-xl border border-white/15 px-3 py-1.5 text-xs"
        >
          Listing
        </Link>
        <Link
          href={`/compare`}
          className="rounded-xl border border-white/15 px-3 py-1.5 text-xs"
        >
          Compare
        </Link>
        <button onClick={onDelete} className="inline-flex items-center gap-1 text-xs text-[#ff8b8b]">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

function RemovedAccountCard({
  item,
  categoryName,
  onRestore,
  onDelete,
  onRecheck,
}: {
  item: RemovedAccount;
  categoryName?: string;
  onRestore: () => void;
  onDelete: () => void;
  onRecheck: () => void;
}) {
  const last = item.snapshots.at(-1);
  const status = statusLabel(item);
  return (
    <div className="panel flex flex-wrap items-center gap-4 p-4">
      {item.sampleIcon ? <img src={item.sampleIcon} alt="" className="h-12 w-12 rounded-2xl" /> : null}
      <div className="min-w-0 flex-1">
        <Link href={`/accounts/${encodeURIComponent(item.developerId)}`} className="font-semibold hover:text-mint">
          {item.name}
        </Link>
        <p className="text-sm text-mist">
          {item.appCount ?? last?.appCount ?? 0} apps · {formatNumber(last?.totalMinInstalls)} min installs
          {categoryName ? ` · ${categoryName}` : ""}
        </p>
        <p className="text-xs text-mist">
          Removed {formatDistanceToNow(item.removedAt, { addSuffix: true })} · {item.snapshots.length} snapshots
        </p>
      </div>
      <span
        className={
          status.tone === "bad"
            ? "rounded-full bg-[#ff8b8b]/15 px-2.5 py-1 text-xs text-[#ff8b8b]"
            : status.tone === "good"
              ? "rounded-full bg-mint/15 px-2.5 py-1 text-xs text-mint"
              : "rounded-full bg-white/8 px-2.5 py-1 text-xs text-mist"
        }
      >
        {status.text}
      </span>
      <PlayStoreLink href={developerPlayUrl(item.developerId)} label={`Open ${item.name} on Play Store`} />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRestore}
          className="inline-flex items-center gap-1 rounded-xl bg-mint px-3 py-1.5 text-xs font-semibold text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restore
        </button>
        <button onClick={onRecheck} className="rounded-xl border border-white/15 px-3 py-1.5 text-xs">
          Recheck Play
        </button>
        <Link
          href={`/accounts/${encodeURIComponent(item.developerId)}`}
          className="rounded-xl border border-white/15 px-3 py-1.5 text-xs"
        >
          Catalog
        </Link>
        <button onClick={onDelete} className="inline-flex items-center gap-1 text-xs text-[#ff8b8b]">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}
