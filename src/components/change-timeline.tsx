"use client";

import { MediaAssetStrip, MediaCompareBlock, type MediaLayout } from "@/components/media-asset-strip";
import type { TimelineEvent, TimelineEventKind } from "@/lib/timeline/app-timeline";
import { isLikelyMediaUrl, isMediaIdNoise } from "@/lib/store/snapshots";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import {
  FileText,
  FolderKanban,
  Images,
  PackagePlus,
  PackageX,
  RotateCcw,
  PencilLine,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

const KIND_META: Record<
  TimelineEventKind,
  { label: string; Icon: ComponentType<{ className?: string }>; tone: string }
> = {
  tracked: { label: "Tracked", Icon: Star, tone: "text-mint bg-mint/12" },
  "app-name": { label: "Name", Icon: PencilLine, tone: "text-sand bg-sand/12" },
  "app-category": { label: "Category", Icon: FolderKanban, tone: "text-mist bg-white/10" },
  "app-update": { label: "Update", Icon: Sparkles, tone: "text-mint bg-mint/12" },
  "app-description": { label: "Description", Icon: FileText, tone: "text-foam bg-white/10" },
  "app-screenshots": { label: "Media", Icon: Images, tone: "text-sand bg-sand/12" },
  unpublished: { label: "Unpublished", Icon: PackageX, tone: "text-[#ffb020] bg-[#ffb020]/15" },
  republished: { label: "Republished", Icon: RotateCcw, tone: "text-mint bg-mint/12" },
  "app-removed": { label: "Removed", Icon: PackageX, tone: "text-[#ff8b8b] bg-[#ff8b8b]/15" },
  score: { label: "Rating", Icon: Star, tone: "text-sand bg-sand/12" },
  installs: { label: "Installs", Icon: PackagePlus, tone: "text-mist bg-white/10" },
};

function displayText(value?: string | null): string | null {
  const v = String(value || "").trim();
  if (!v || isMediaIdNoise(v) || isLikelyMediaUrl(v)) return null;
  return v;
}

function layoutFor(event: TimelineEvent): MediaLayout {
  return event.mediaKind || "screenshots";
}

export function ChangeTimeline({
  events,
  showAppLink = false,
  emptyHint = "No listing changes for this app yet. Track it and run Sync all / Force reload after Play updates.",
}: {
  events: TimelineEvent[];
  showAppLink?: boolean;
  emptyHint?: string;
}) {
  if (!events.length) {
    return <p className="text-sm text-mist">{emptyHint}</p>;
  }

  return (
    <ol className="relative space-y-0 border-l border-white/10 pl-5">
      {events.map((event) => {
        const meta = KIND_META[event.kind] ?? KIND_META["app-update"];
        const Icon = meta.Icon;
        const fromText = displayText(event.from);
        const toText = displayText(event.to);
        const isMedia = event.kind === "app-screenshots";
        const hasMedia =
          (event.screenshotsBefore || []).some(isLikelyMediaUrl) ||
          (event.screenshots || []).some(isLikelyMediaUrl);
        return (
          <li key={event.id} className="relative pb-6 last:pb-0">
            <span
              className={cn(
                "absolute -left-[1.6rem] top-0 grid h-7 w-7 place-items-center rounded-full ring-4 ring-[#071018]",
                meta.tone,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="rounded-2xl border border-white/8 bg-[#0b1720]/55 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {event.icon && isLikelyMediaUrl(event.icon) ? (
                  <img src={event.icon} alt="" className="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10" />
                ) : null}
                <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist">
                  {meta.label}
                </span>
                <p className="text-sm font-semibold text-foam">{event.title}</p>
                {showAppLink ? (
                  <Link
                    href={`/apps/${encodeURIComponent(event.appId)}`}
                    className="truncate text-xs text-mint hover:underline"
                  >
                    {event.appTitle}
                  </Link>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-5 text-mist">{event.summary}</p>
              <p className="mt-1 text-[11px] text-mist/70" title={format(event.ts, "PPpp")}>
                {formatDistanceToNow(event.ts, { addSuffix: true })} · {format(event.ts, "MMM d, yyyy · HH:mm")}
              </p>

              {!isMedia && (fromText || toText) ? (
                <div className="mt-2 grid gap-1.5 rounded-xl bg-black/25 px-2.5 py-2 text-xs leading-5">
                  {fromText ? (
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">Old</span>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-foam/90">{fromText}</p>
                    </div>
                  ) : null}
                  {toText ? (
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">New</span>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-foam/90">{toText}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {event.added ? (
                <div className="mt-2 rounded-xl border border-mint/25 bg-mint/8 px-2.5 py-2 text-xs leading-5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-mint">Newly added</span>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-foam/95">{event.added}</p>
                </div>
              ) : null}

              {event.recentChanges ? (
                <div className="mt-2 rounded-xl bg-black/25 px-2.5 py-2 text-xs leading-5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">What&apos;s new</span>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-foam/90">{event.recentChanges}</p>
                </div>
              ) : null}

              {isMedia ? (
                hasMedia ? (
                  <MediaCompareBlock
                    before={event.screenshotsBefore}
                    after={event.screenshots}
                    layout={layoutFor(event)}
                    fromLabel={fromText}
                    toLabel={toText}
                  />
                ) : (
                  <div className="mt-2">
                    {(fromText || toText) ? (
                      <p className="text-xs text-mist">
                        {[fromText, toText].filter(Boolean).join(" → ")}
                      </p>
                    ) : (
                      <p className="text-xs text-mist">Media changed — open the app and Sync all to store preview images.</p>
                    )}
                    <MediaAssetStrip urls={event.screenshotsBefore} label="Old" layout={layoutFor(event)} />
                    <MediaAssetStrip urls={event.screenshots} label="New" layout={layoutFor(event)} />
                  </div>
                )
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
