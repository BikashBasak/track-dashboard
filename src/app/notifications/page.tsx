"use client";

import { NotificationKindIcon, NotificationRow } from "@/components/notification-item";
import { EmptyState, PageHeader } from "@/components/ui";
import { useSettings } from "@/components/settings-context";
import { useStorefront } from "@/components/storefront";
import { useWatchlist } from "@/components/watchlist-context";
import { KIND_META, kindMeta } from "@/lib/notifications/meta";
import { unreadCount } from "@/lib/notifications/store";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications/types";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { runFullSync, resolveFullSyncMode } from "@/lib/sync/full-sync";
import { readFullSyncMeta } from "@/lib/sync/full-sync-meta";
import { cn } from "@/lib/utils";
import { CheckCheck, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type Filter = "all" | "unread" | NotificationKind;

export default function NotificationsPage() {
  const { qs } = useStorefront();
  const watch = useWatchlist();
  const { replaceFullSync } = useSettings();
  const notes = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const visible = useMemo(() => {
    return notes.items.filter((item) => {
      if (filter === "unread") return !item.read;
      if (filter === "all") return true;
      return item.kind === filter;
    });
  }, [notes.items, filter]);

  const trackedCount = watch.data.apps.length + watch.data.accounts.length;
  const nextMode = resolveFullSyncMode();

  async function checkNow() {
    setBusy(true);
    setMessage("");
    const before = unreadCount();
    try {
      const result = await runFullSync(qs, {
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
      });
      replaceFullSync(readFullSyncMeta());
      const extra = Math.max(0, unreadCount() - before);
      if (result.mode === "baseline") {
        setMessage(
          `Baseline saved for ${result.appsOk} app${result.appsOk === 1 ? "" : "s"} and ${result.accountsOk} account${result.accountsOk === 1 ? "" : "s"}. Run Check now again to verify and notify.`,
        );
      } else {
        const parts = [
          `Verified ${result.appsOk} app${result.appsOk === 1 ? "" : "s"} and ${result.accountsOk} account${result.accountsOk === 1 ? "" : "s"}.`,
        ];
        if (result.removedApps || result.removedAccounts) {
          parts.push(
            `Unpublished ${result.removedApps} app${result.removedApps === 1 ? "" : "s"} and removed ${result.removedAccounts} account${result.removedAccounts === 1 ? "" : "s"}.`,
          );
        }
        if (extra > 0) parts.push(`${extra} new alert${extra === 1 ? "" : "s"} landed in the inbox.`);
        else parts.push("No new listing changes.");
        if (result.errors.length) parts.push(result.errors.slice(0, 3).join(" · "));
        setMessage(parts.join(" "));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Module · Live"
        title="Notifications"
        description="First Check now / Sync all stores a Play baseline. The next run compares live Play to that store and notifies for removals, new apps, name, description, screenshots, and updates."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setManage((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-mist hover:text-foam"
            >
              <Settings2 className="h-4 w-4" />
              Manage
            </button>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-mist hover:text-foam"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={() => void checkNow()}
              disabled={busy || trackedCount === 0}
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
            >
              {busy
                ? nextMode === "baseline"
                  ? "Saving baseline…"
                  : "Verifying…"
                : nextMode === "baseline"
                  ? "Check now · save baseline"
                  : "Check now · verify"}
            </button>
          </div>
        }
      />

      {message ? <p className="mb-4 text-sm text-mist">{message}</p> : null}

      {manage ? (
        <section className="panel mb-6 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Alert types</h2>
              <p className="mt-1 text-sm text-mist">
                Turn off types you do not want. Existing alerts stay until you remove them.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={notes.markAllRead}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-mist hover:text-foam"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Clear every notification from this inbox?")) notes.clearAll();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-mist hover:text-[#ff8b8b]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {NOTIFICATION_KINDS.map((kind) => (
              <label key={kind} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 px-3 py-3 hover:bg-white/4">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={notes.prefs.enabled[kind]}
                  onChange={(e) => notes.setKindEnabled(kind, e.target.checked)}
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <NotificationKindIcon kind={kind} className="h-4 w-4 text-mint" />
                    {KIND_META[kind].label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-mist">{KIND_META[kind].description}</p>
                </div>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {(["all", "unread"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              filter === id ? "bg-mint text-ink" : "bg-white/8 text-mist hover:text-foam",
            )}
          >
            {id === "all" ? `All (${notes.items.length})` : `Unread (${notes.unread})`}
          </button>
        ))}
        {NOTIFICATION_KINDS.map((kind) => {
          const count = notes.items.filter((item) => item.kind === kind).length;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setFilter(kind)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                filter === kind ? "bg-mint text-ink" : "bg-white/8 text-mist hover:text-foam",
              )}
            >
              {KIND_META[kind].short}
              {count ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={notes.items.length === 0 ? "Inbox is empty" : "Nothing in this filter"}
          body={
            notes.items.length === 0
              ? trackedCount === 0
                ? "Track apps or publisher accounts first, then click Check now. Alerts appear when Play listings change."
                : "Click Check now to compare tracked listings with Google Play. Name, category, version, takedowns, and new publisher apps land here."
              : "Try All or Unread, or another alert type."
          }
        />
      ) : (
        <div className="grid gap-2">
          {visible.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onOpen={(row) => notes.markRead(row.id)}
              onRemove={notes.remove}
              onToggleRead={(row) => (row.read ? notes.markUnread(row.id) : notes.markRead(row.id))}
            />
          ))}
        </div>
      )}

      {notes.items.length > 0 && !manage ? (
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <button type="button" onClick={notes.markAllRead} className="text-mint hover:underline">
            Mark all read
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear every notification from this inbox?")) notes.clearAll();
            }}
            className="text-mist hover:text-[#ff8b8b]"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
