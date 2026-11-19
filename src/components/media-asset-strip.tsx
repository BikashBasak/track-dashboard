"use client";

import { isLikelyMediaUrl } from "@/lib/store/snapshots";
import { cn } from "@/lib/utils";

export type MediaLayout = "screenshots" | "icon" | "banner" | "video";

function isVideoUrl(url: string) {
  return /(\.mp4|\.webm|youtube\.com|youtu\.be|googleusercontent\.com\/.*video)/i.test(url);
}

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url.startsWith("//") ? `https:${url}` : url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function AssetThumb({
  url,
  layout,
}: {
  url: string;
  layout: MediaLayout;
}) {
  const href = url.startsWith("//") ? `https:${url}` : url;
  if (layout === "video" || isVideoUrl(href)) {
    const embed = youtubeEmbed(href);
    if (embed) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className="block shrink-0">
          <iframe
            src={embed}
            title="Promo video"
            className="h-28 w-44 rounded-lg border-0 ring-1 ring-white/10"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            loading="lazy"
          />
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block shrink-0">
        <video
          src={href}
          className="h-28 w-44 rounded-lg object-cover ring-1 ring-white/10"
          controls
          muted
          playsInline
          preload="metadata"
        />
      </a>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="shrink-0">
      <img
        src={href}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        className={cn(
          "rounded-lg object-cover ring-1 ring-white/10",
          layout === "icon" && "h-16 w-16 rounded-2xl",
          layout === "banner" && "h-24 w-44 object-cover",
          layout === "screenshots" && "h-28 w-16 object-cover object-top",
          !["icon", "banner", "screenshots"].includes(layout) && "h-28 w-16 object-cover object-top",
        )}
      />
    </a>
  );
}

export function MediaAssetStrip({
  urls,
  label,
  layout = "screenshots",
}: {
  urls?: string[] | null;
  label: string;
  layout?: MediaLayout;
}) {
  const list = (urls || []).map((u) => String(u || "").trim()).filter(isLikelyMediaUrl);
  if (!list.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">{label}</p>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
        {list.map((url) => (
          <AssetThumb key={url} url={url} layout={layout} />
        ))}
      </div>
    </div>
  );
}

export function MediaCompareBlock({
  before,
  after,
  layout = "screenshots",
  fromLabel,
  toLabel,
  compact = false,
}: {
  before?: string[] | null;
  after?: string[] | null;
  layout?: MediaLayout;
  fromLabel?: string | null;
  toLabel?: string | null;
  compact?: boolean;
}) {
  const oldUrls = (before || []).map((u) => String(u || "").trim()).filter(isLikelyMediaUrl);
  const newUrls = (after || []).map((u) => String(u || "").trim()).filter(isLikelyMediaUrl);
  const rows = Math.max(oldUrls.length, newUrls.length);
  if (!rows) return null;

  const countHint =
    fromLabel || toLabel ? (
      <p className="mb-2 text-xs text-mist">{[fromLabel, toLabel].filter(Boolean).join(" → ")}</p>
    ) : null;

  return (
    <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-2.5 py-2">
      {countHint}
      <div className="grid grid-cols-2 gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-mist/70">Old</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-mint/80">New</p>
        {Array.from({ length: rows }, (_, index) => (
          <ComparePair
            key={`${layout}-${index}`}
            oldUrl={oldUrls[index]}
            newUrl={newUrls[index]}
            layout={layout}
            compact={compact}
            index={layout === "screenshots" ? index + 1 : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ComparePair({
  oldUrl,
  newUrl,
  layout,
  compact,
  index,
}: {
  oldUrl?: string;
  newUrl?: string;
  layout: MediaLayout;
  compact: boolean;
  index?: number;
}) {
  return (
    <>
      <CompareFrame url={oldUrl} layout={layout} compact={compact} emptyLabel="No old asset" index={index} />
      <CompareFrame url={newUrl} layout={layout} compact={compact} emptyLabel="Removed" />
    </>
  );
}

function CompareFrame({
  url,
  layout,
  compact,
  emptyLabel,
  index,
}: {
  url?: string;
  layout: MediaLayout;
  compact: boolean;
  emptyLabel: string;
  index?: number;
}) {
  const frame = cn(
    "relative grid place-items-center overflow-hidden rounded-lg bg-black/50 ring-1 ring-white/10",
    layout === "icon" && (compact ? "mx-auto h-16 w-16" : "mx-auto h-24 w-24"),
    layout === "banner" && (compact ? "h-16 w-full" : "h-28 w-full"),
    layout === "screenshots" && (compact ? "h-40 w-full" : "h-56 w-full"),
    layout === "video" && (compact ? "h-24 w-full" : "h-32 w-full"),
  );

  if (!url) {
    return (
      <div className={cn(frame, "border border-dashed border-white/15 text-[10px] font-medium uppercase tracking-wide text-mist")}>
        {index ? <span className="absolute left-1.5 top-1 text-[10px] text-mist/80">{index}</span> : null}
        {emptyLabel}
      </div>
    );
  }

  const href = url.startsWith("//") ? `https:${url}` : url;
  if (layout === "video" || isVideoUrl(href)) {
    return (
      <div className={frame}>
        <AssetThumb url={href} layout="video" />
      </div>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={frame} title="Open full size">
      {index ? (
        <span className="absolute left-1.5 top-1 z-10 rounded bg-black/70 px-1 text-[10px] font-semibold text-foam">
          {index}
        </span>
      ) : null}
      <img
        src={href}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        className="max-h-full max-w-full object-contain"
      />
    </a>
  );
}
