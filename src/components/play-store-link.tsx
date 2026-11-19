"use client";

import { cn } from "@/lib/utils";

function PlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#34A853" d="M3.6 2.5 14.2 12 3.6 21.5v-19z" />
      <path fill="#FBBC04" d="m3.6 21.5 10.6-9.5 3.3 3-13.9 6.5z" />
      <path fill="#EA4335" d="M21.2 10.1 17.5 12l-3.3-3 6.2-3.6c.9.5.9 1.8.8 4.7z" />
      <path fill="#4285F4" d="m14.2 12 3.3 3 3.7 2.1c.6-.4.8-1 .8-2.1V10c0-1.1-.3-1.7-.8-2.1L14.2 12z" />
    </svg>
  );
}

export function PlayStoreLink({
  href,
  label,
  compact = true,
}: {
  href: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl border border-white/12 text-mist transition hover:border-mint/40 hover:text-foam",
        compact ? "h-8 w-8" : "h-10 gap-2 px-3 text-sm",
      )}
    >
      <PlayMark className="h-4 w-4" />
      {compact ? null : <span>Play</span>}
    </a>
  );
}
