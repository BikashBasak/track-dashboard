"use client";

import { AppIcon } from "@/components/app-icon";
import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { cn, playUrl } from "@/lib/utils";
import type { AppSummary } from "@/lib/playstore/types";
import { Star } from "lucide-react";
import Link from "next/link";

export function AppCard({
  app,
  href,
  extra,
  className,
  playLink = true,
}: {
  app: AppSummary;
  href?: string;
  extra?: React.ReactNode;
  className?: string;
  /** Show Play Store redirect (default true). */
  playLink?: boolean;
}) {
  const { country } = useStorefront();
  const target = href ?? `/apps/${encodeURIComponent(app.appId)}`;
  return (
    <div className={cn("panel group flex items-start gap-3 overflow-hidden p-4 transition hover:border-mint/30", className)}>
      <Link href={target} className="flex min-w-0 flex-1 gap-3">
        <AppIcon src={app.icon} className="h-14 w-14 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foam group-hover:text-mint">{app.title}</p>
          <p className="truncate text-sm text-mist">{app.developer}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist">
            {app.score != null ? (
              <span className="inline-flex items-center gap-1 text-sand">
                <Star className="h-3.5 w-3.5 fill-current" />
                {app.score.toFixed(2)}
              </span>
            ) : null}
            {app.installs ? <span>{app.installs}</span> : null}
            {app.genre ? <span className="rounded-full bg-white/6 px-2 py-0.5">{app.genre}</span> : null}
            {extra}
          </div>
        </div>
      </Link>
      {playLink ? (
        <PlayStoreLink href={playUrl(app.appId, country)} label={`Open ${app.title} on Play Store`} />
      ) : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad" | "muted";
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wider text-mist">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold",
          tone === "good" && "text-mint",
          tone === "warn" && "text-sand",
          tone === "bad" && "text-[#ff8b8b]",
          tone === "muted" && "text-mist",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-mist">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mint">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <p className="font-semibold text-foam">{title}</p>
      <p className="mt-2 text-sm text-mist">{body}</p>
    </div>
  );
}
