"use client";

import { cn } from "@/lib/utils";

export function ScreenshotScroller({
  urls,
  title = "Screenshots",
  className,
  imageClassName,
  rows = 1,
}: {
  urls?: string[] | null;
  title?: string;
  className?: string;
  imageClassName?: string;
  /** Stack screenshots into N rows and scroll sideways. */
  rows?: number;
}) {
  const list = (urls || []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!list.length) return null;

  const rowCount = Math.max(1, Math.min(6, Math.floor(rows) || 1));

  return (
    <div className={cn("min-w-0", className)}>
      {title ? <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-mist">{title}</p> : null}
      <div
        className={cn(
          "gap-2.5 overflow-x-auto pb-1 soft-scroll",
          rowCount === 1 ? "flex" : "grid grid-flow-col",
        )}
        style={
          rowCount > 1
            ? {
                gridTemplateRows: `repeat(${rowCount}, auto)`,
                gridAutoColumns: "max-content",
              }
            : undefined
        }
      >
        {list.map((src) => (
          <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
            <img
              src={src}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className={cn(
                "h-44 w-auto rounded-xl border border-white/10 bg-[#0b1720] object-cover object-top",
                imageClassName,
              )}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
