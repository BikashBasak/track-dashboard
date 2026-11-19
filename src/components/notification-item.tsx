"use client";

import { MediaCompareBlock, type MediaLayout } from "@/components/media-asset-strip";
import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { kindMeta } from "@/lib/notifications/meta";
import type { NotificationItem as Item } from "@/lib/notifications/types";
import { isLikelyMediaUrl, isMediaIdNoise } from "@/lib/store/snapshots";
import { cn, developerPlayUrl, playUrl } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderKanban,
  Images,
  PackagePlus,
  PackageX,
  RotateCcw,
  PencilLine,
  Sparkles,
  Trash2,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType } from "react";

const ICONS: Record<Item["kind"], ComponentType<{ className?: string }>> = {
  "account-name": Building2,
  "app-name": PencilLine,
  "app-category": FolderKanban,
  "app-removed": PackageX,
  "app-republished": RotateCcw,
  "account-removed": UserX,
  "app-update": Sparkles,
  "account-new-app": PackagePlus,
  "app-description": FileText,
  "app-screenshots": Images,
};

function notificationPlayHref(item: Item, country: string): string | null {
  if (item.relatedAppId) return playUrl(item.relatedAppId, country);
  if (item.kind === "account-name" || item.kind === "account-removed") {
    return developerPlayUrl(item.entityId);
  }
  if (item.kind.startsWith("app-")) return playUrl(item.entityId, country);
  return null;
}

export function NotificationKindIcon({ kind, className }: { kind: Item["kind"]; className?: string }) {
  const Icon = ICONS[kind] ?? Bell;
  return <Icon className={className} />;
}

function DescriptionCompare({
  from,
  to,
  added,
  compact,
}: {
  from?: string | null;
  to?: string | null;
  added?: string | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <div
      className={cn(
        "mt-2 grid gap-2 rounded-xl border border-white/8 bg-black/25 px-2.5 py-2 text-xs leading-5",
        compact && "py-1.5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">Description comparison</span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-mint hover:bg-mint/10"
        >
          {expanded ? (
            <>
              Collapse <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Show full <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      </div>

      {added ? (
        <div className="min-w-0 rounded-lg border border-mint/25 bg-mint/8 px-2.5 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-mint">Newly added</span>
          <p className={cn("mt-0.5 break-words whitespace-pre-wrap text-foam/95", !expanded && "line-clamp-3")}>
            {added}
          </p>
        </div>
      ) : null}

      {from ? (
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">Old</span>
          <p className={cn("mt-0.5 break-words whitespace-pre-wrap text-foam/90", !expanded && "line-clamp-4")}>
            {from}
          </p>
        </div>
      ) : null}
      {to ? (
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">New</span>
          <p className={cn("mt-0.5 break-words whitespace-pre-wrap text-foam/90", !expanded && "line-clamp-4")}>
            {to}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function readableCompareText(value?: string | null): string | null {
  const v = String(value || "").trim();
  if (!v || isMediaIdNoise(v) || isLikelyMediaUrl(v)) return null;
  return v;
}

function SimpleCompare({
  from,
  to,
  compact,
}: {
  from?: string | null;
  to?: string | null;
  compact?: boolean;
}) {
  const fromText = readableCompareText(from);
  const toText = readableCompareText(to);
  if (!fromText && !toText) return null;
  return (
    <div
      className={cn(
        "mt-2 grid gap-1.5 rounded-xl border border-white/8 bg-black/25 px-2.5 py-2 text-xs leading-5",
        compact && "py-1.5",
      )}
    >
      {fromText ? (
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">Old</span>
          <p className="mt-0.5 break-words text-foam/90">{fromText}</p>
        </div>
      ) : null}
      {toText ? (
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">New</span>
          <p className="mt-0.5 break-words text-foam/90">{toText}</p>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationRow({
  item,
  compact,
  onOpen,
  onRemove,
  onToggleRead,
}: {
  item: Item;
  compact?: boolean;
  onOpen: (item: Item) => void;
  onRemove: (id: string) => void;
  onToggleRead?: (item: Item) => void;
}) {
  const { country } = useStorefront();
  const playHref = notificationPlayHref(item, country);
  const publisherId = item.publisherId?.trim() || null;
  const isDescription = item.kind === "app-description";
  const isMedia = item.kind === "app-screenshots";
  const mediaLayout: MediaLayout = item.mediaKind || "screenshots";
  const hasMedia =
    (item.mediaBefore || []).some(isLikelyMediaUrl) || (item.mediaAfter || []).some(isLikelyMediaUrl);

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-2xl border border-transparent px-3 py-3 transition",
        !item.read && "bg-mint/8",
        item.read && "hover:bg-white/4",
        compact ? "py-2.5" : "border-white/8 bg-[#0b1720]/60",
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        {item.icon ? (
          <img src={item.icon} alt="" className="h-10 w-10 rounded-xl object-cover" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-mint/12 text-mint">
            <NotificationKindIcon kind={item.kind} className="h-4 w-4" />
          </div>
        )}
        {!item.read ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-mint" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link href={item.href} onClick={() => onOpen(item)} className="block min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("text-sm font-semibold", !item.read && "text-foam")}>{item.title}</p>
                <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] uppercase tracking-wide text-mist">
                  {kindMeta(item.kind).short}
                </span>
              </div>
              <p className="mt-1 text-sm leading-5 text-mist">{item.body}</p>
              {publisherId ? (
                <p className="mt-1 break-all font-mono text-[11px] text-mist/80">
                  Publisher ID · {publisherId}
                </p>
              ) : null}
            </Link>
            {isDescription && (item.from || item.to || item.added) ? (
              <DescriptionCompare from={item.from} to={item.to} added={item.added} compact={compact} />
            ) : isMedia ? (
              hasMedia ? (
                <MediaCompareBlock
                  before={item.mediaBefore}
                  after={item.mediaAfter}
                  layout={mediaLayout}
                  fromLabel={readableCompareText(item.from)}
                  toLabel={readableCompareText(item.to)}
                  compact={compact}
                />
              ) : (
                <SimpleCompare from={item.from} to={item.to} compact={compact} />
              )
            ) : item.from || item.to ? (
              <SimpleCompare from={item.from} to={item.to} compact={compact} />
            ) : null}
            <p className="mt-1 text-xs text-mist/80">
              {formatDistanceToNow(item.createdAt, { addSuffix: true })}
            </p>
          </div>
          {playHref ? <PlayStoreLink href={playHref} label={`Open on Play Store`} /> : null}
        </div>
        <div
          className={cn(
            "mt-2 flex flex-wrap gap-2",
            compact && "opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <Link
            href={item.href}
            onClick={() => onOpen(item)}
            className="rounded-lg bg-mint/15 px-2.5 py-1 text-xs font-semibold text-mint hover:bg-mint/25"
          >
            Open
          </Link>
          {onToggleRead ? (
            <button
              type="button"
              onClick={() => onToggleRead(item)}
              className="rounded-lg px-2.5 py-1 text-xs text-mist hover:bg-white/8 hover:text-foam"
            >
              {item.read ? "Mark unread" : "Mark read"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-mist hover:bg-white/8 hover:text-[#ff8b8b]"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
