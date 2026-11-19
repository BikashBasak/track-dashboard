"use client";

import { cn, normalizeMediaUrl } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * Play googleusercontent icons often 403 when the page Referer is sent.
 * Always load with referrerPolicy=no-referrer and fall back cleanly.
 */
export function AppIcon({
  src,
  alt = "",
  className,
  fallbackSrc,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackSrc?: string | null;
}) {
  const primary = normalizeMediaUrl(src);
  const fallback = normalizeMediaUrl(fallbackSrc);
  const [current, setCurrent] = useState(primary || fallback);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrent(primary || fallback);
    setFailed(false);
  }, [primary, fallback]);

  if (!current || failed) {
    return (
      <div
        className={cn("shrink-0 bg-[#0b1720] ring-1 ring-white/10", className)}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 bg-[#0b1720] object-cover", className)}
      onError={() => {
        if (fallback && current !== fallback) {
          setCurrent(fallback);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
