"use client";

import { AppIcon } from "@/components/app-icon";
import { ChangeTimeline } from "@/components/change-timeline";
import { ScreenshotScroller } from "@/components/screenshot-scroller";
import { useStorefront } from "@/components/storefront";
import { useWatchlist } from "@/components/watchlist-context";
import { AppCard, EmptyState, Metric, PageHeader } from "@/components/ui";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { ageBadgeCopy, updateFreshness } from "@/lib/playstore/metrics";
import type {
  AppDetails,
  AppSnapshot,
  AppSummary,
  DerivedAppMetrics,
  PermissionGroup,
  ReviewItem,
  TrackedApp,
} from "@/lib/playstore/types";
import { buildAppTimeline } from "@/lib/timeline/app-timeline";
import { formatFullNumber, formatNumber, formatScore, playUrl } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Star } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Tab = "overview" | "reviews" | "similar" | "privacy" | "timeline";

function resolveTab(raw: string | null): Tab {
  if (raw === "timeline" || raw === "history") return "timeline";
  if (raw === "reviews" || raw === "similar" || raw === "privacy") return raw;
  return "overview";
}

function AppDetailPageInner() {
  const params = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const appId = decodeURIComponent(params.appId);
  const { qs, country } = useStorefront();
  const watch = useWatchlist();
  const { items: notifications } = useNotifications();
  const [tab, setTab] = useState<Tab>(() => resolveTab(searchParams.get("tab")));
  const [app, setApp] = useState<AppDetails | null>(null);
  const [metrics, setMetrics] = useState<DerivedAppMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [similar, setSimilar] = useState<AppSummary[]>([]);
  const [permissions, setPermissions] = useState<PermissionGroup[]>([]);
  const [dataSafety, setDataSafety] = useState<{ sharedData?: { data?: string; purpose?: string }[]; collectedData?: { data?: string; purpose?: string }[] } | null>(null);
  const [serverSnapshots, setServerSnapshots] = useState<AppSnapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/apps/${encodeURIComponent(appId)}?${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load app");
        if (cancelled) return;
        setApp(data.app);
        setMetrics(data.metrics);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [appId, qs]);

  useEffect(() => {
    if (!app) return;
    fetch(`/api/apps/${encodeURIComponent(appId)}/reviews?${qs}`)
      .then((r) => r.json())
      .then((d) => setReviews(d.reviews || []))
      .catch(() => undefined);
    fetch(`/api/apps/${encodeURIComponent(appId)}/similar?${qs}`)
      .then((r) => r.json())
      .then((d) => setSimilar(d.similar || []))
      .catch(() => undefined);
    fetch(`/api/apps/${encodeURIComponent(appId)}/permissions?${qs}`)
      .then((r) => r.json())
      .then((d) => setPermissions(d.permissions || []))
      .catch(() => undefined);
    fetch(`/api/apps/${encodeURIComponent(appId)}/datasafety?${qs}`)
      .then((r) => r.json())
      .then((d) => setDataSafety(d.dataSafety || null))
      .catch(() => undefined);
  }, [app, appId, qs]);

  const tracked = watch.getTrackedApp(appId);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/history`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const snaps = Array.isArray(data.snapshots) ? (data.snapshots as AppSnapshot[]) : [];
        setServerSnapshots(snaps);
      } catch {
        if (!cancelled) setServerSnapshots(null);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [appId, tracked?.snapshots?.length]);

  const trackedForTimeline = useMemo<TrackedApp | null>(() => {
    if (!tracked) return null;
    if (!serverSnapshots?.length) return tracked;
    const byTs = new Map<number, AppSnapshot>();
    for (const snap of [...tracked.snapshots, ...serverSnapshots]) byTs.set(snap.ts, snap);
    return {
      ...tracked,
      snapshots: [...byTs.values()].sort((a, b) => a.ts - b.ts),
    };
  }, [tracked, serverSnapshots]);

  const histogram = useMemo(() => {
    if (!app) return [];
    return ["5", "4", "3", "2", "1"].map((star) => ({
      star,
      count: app.histogram[star] || 0,
    }));
  }, [app]);

  const history = (trackedForTimeline?.snapshots || tracked?.snapshots || []).map((s) => ({
    time: new Date(s.ts).toLocaleDateString(),
    score: s.score,
    installs: s.maxInstalls ?? s.minInstalls,
  }));

  const timeline = useMemo(() => {
    if (!trackedForTimeline) return [];
    return buildAppTimeline(trackedForTimeline, notifications);
  }, [trackedForTimeline, notifications]);

  async function toggleTrack() {
    if (!app) return;
    setBusy(true);
    try {
      if (tracked) {
        watch.untrackAppLocal(app.appId);
        fetch(`/api/watchlist?type=app&id=${encodeURIComponent(app.appId)}`, { method: "DELETE" }).catch(() => undefined);
      } else {
        watch.trackAppLocal(app);
        fetch(`/api/watchlist?${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "app", appId: app.appId }),
        }).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-mist">Loading Play Store listing…</p>;
  if (error || !app) return <EmptyState title="Could not load this app" body={error || "Check the package id and country."} />;

  const age = ageBadgeCopy(metrics?.ageLabel || "unknown");
  const fresh = updateFreshness(metrics?.updateAgeDays ?? null);
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "reviews", label: "Reviews" },
    { id: "similar", label: "Similar" },
    { id: "privacy", label: "Permissions & safety" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="App Tracking"
        title={app.title}
        description={
          tracked?.listingStatus === "unpublished"
            ? "Unpublished on Google Play — still tracked on App Tracking."
            : app.summary || app.developer
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {tracked?.listingStatus === "unpublished" ? (
              <span className="inline-flex items-center rounded-xl bg-[#ffb020]/18 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#ffb020]">
                Unpublished
              </span>
            ) : null}
            {app.developerId ? (
              <Link
                href={`/accounts/${encodeURIComponent(app.developerId)}`}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm"
              >
                Open publisher
              </Link>
            ) : null}
            {tracked ? (
              <button
                type="button"
                onClick={() => setTab("timeline")}
                className="rounded-xl border border-mint/40 px-4 py-2 text-sm text-mint"
              >
                Timeline
              </button>
            ) : null}
            <a
              href={playUrl(app.appId, country)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm"
            >
              Play Store <ExternalLink className="h-4 w-4" />
            </a>
            <button
              onClick={() => void toggleTrack()}
              disabled={busy}
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
            >
            {tracked ? "Remove from tracking" : "Track this app"}
            </button>
            {watch.data.categories.length > 0 ? (
              <select
                value={tracked ? tracked.categoryId ?? "" : watch.lastAppCategoryId ?? ""}
                onChange={(e) => {
                  const categoryId = e.target.value || null;
                  if (!app) return;
                  if (!tracked) watch.trackAppLocal(app, categoryId);
                  else watch.setAppCategory(app.appId, categoryId);
                }}
                className="h-10 rounded-xl border border-white/15 bg-[#0d1b26] px-3 text-sm"
                aria-label="Tracking category"
              >
                <option value="">Choose category</option>
                {watch.data.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        }
      />

      <div className="panel mb-6 overflow-hidden">
        {app.headerImage ? (
          <img
            src={app.headerImage}
            alt=""
            referrerPolicy="no-referrer"
            className="h-40 w-full object-cover sm:h-52"
          />
        ) : null}
        <div className="flex flex-wrap gap-4 p-5">
          <AppIcon src={app.icon} className="h-20 w-20 rounded-3xl" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-mist">{app.appId}</p>
            <p className="mt-1 text-sm text-mist">{app.developer}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/8 px-2.5 py-1">{app.genre || "Uncategorized"}</span>
              <span className="rounded-full bg-white/8 px-2.5 py-1">{app.free ? app.priceText || "Free" : app.priceText}</span>
              {app.adSupported ? <span className="rounded-full bg-sand/15 px-2.5 py-1 text-sand">Contains ads</span> : null}
              {app.offersIAP ? <span className="rounded-full bg-sand/15 px-2.5 py-1 text-sand">In-app purchases {app.IAPRange ? `· ${app.IAPRange}` : ""}</span> : null}
              {app.editorsChoice ? <span className="rounded-full bg-mint/15 px-2.5 py-1 text-mint">Editors Choice</span> : null}
              <span className="rounded-full bg-white/8 px-2.5 py-1" title={age.hint}>{age.text}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Installs"
          value={app.maxInstalls ? formatNumber(app.maxInstalls) : app.installs || formatNumber(app.minInstalls)}
          hint={app.maxInstalls ? `Play precise count ${formatFullNumber(app.maxInstalls)}` : "Play Store band"}
        />
        <Metric label="Rating" value={formatScore(app.score)} hint={`${formatNumber(app.ratings)} ratings`} />
        <Metric
          label="D/I"
          value={formatNumber(metrics?.dailyInstallsEstimate)}
          hint={
            metrics?.dailyInstallsEstimate != null && metrics.ageDays
              ? `${formatFullNumber(app.maxInstalls ?? app.minInstalls)} ÷ ${metrics.ageDays} days since Released`
              : "Precise Play installs ÷ days since Released"
          }
        />
        <Metric label="Last update" value={fresh.text} hint={app.updated ? formatDistanceToNow(app.updated, { addSuffix: true }) : "Not published"} tone={fresh.tone} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? "rounded-full bg-mint px-4 py-1.5 text-sm font-semibold text-ink" : "rounded-full bg-white/6 px-4 py-1.5 text-sm text-mist"}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="panel p-5">
              <h2 className="font-semibold">About</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-mist">{app.description}</p>
            </section>
            {app.recentChanges ? (
              <section className="panel p-5">
                <h2 className="font-semibold">What&apos;s new</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-mist">{app.recentChanges}</p>
              </section>
            ) : null}
            {app.screenshots.length > 0 ? (
              <section className="panel p-5">
                <h2 className="font-semibold">Screenshots</h2>
                <div className="mt-3">
                  <ScreenshotScroller urls={app.screenshots} title="" imageClassName="h-72 rounded-2xl" />
                </div>
              </section>
            ) : null}
          </div>
          <div className="space-y-4">
            <section className="panel p-5">
              <h2 className="font-semibold">Listing facts</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="Version" value={app.version || "—"} />
                <Row label="Android" value={app.androidVersionText || app.androidVersion || "—"} />
                <Row label="Released" value={app.released || "—"} />
                <Row label="Content rating" value={app.contentRating || "—"} />
                <Row label="Reviews" value={formatFullNumber(app.reviews)} />
                <Row label="Website" value={app.developerWebsite || "—"} />
                <Row label="Support email" value={app.developerEmail || "—"} />
              </dl>
            </section>
            <section className="panel p-5">
              <h2 className="font-semibold">Rating mix</h2>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogram} layout="vertical">
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="star" width={24} stroke="#8aa39a" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3ee0b3" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-mist">
                5-star share {metrics?.fiveStarShare != null ? `${Math.round(metrics.fiveStarShare * 100)}%` : "—"}
              </p>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "reviews" ? (
        <div className="mt-6 grid gap-3">
          {reviews.length === 0 ? <EmptyState title="No reviews loaded" body="Play Store sometimes rate-limits review pages. Try again in a moment." /> : null}
          {reviews.map((review) => (
            <article key={review.id} className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{review.userName}</p>
                <span className="inline-flex items-center gap-1 text-sm text-sand">
                  <Star className="h-3.5 w-3.5 fill-current" /> {review.score}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-mist">{review.text}</p>
              <p className="mt-2 text-xs text-mist">
                {review.date}
                {review.version ? ` · v${review.version}` : ""}
                {review.thumbsUp ? ` · ${review.thumbsUp} found useful` : ""}
              </p>
              {review.replyText ? (
                <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-foam">Developer: {review.replyText}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {tab === "similar" ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {similar.map((item) => (
            <AppCard key={item.appId} app={item} />
          ))}
        </div>
      ) : null}

      {tab === "privacy" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="panel p-5">
            <h2 className="font-semibold">Permissions</h2>
            <ul className="mt-4 space-y-2 text-sm text-mist">
              {permissions.length === 0 ? <li>No permission list returned.</li> : null}
              {permissions.map((p, i) => (
                <li key={`${p.permission}-${i}`} className="rounded-lg bg-white/4 px-3 py-2">
                  <span className="text-foam">{p.permission}</span>
                  {p.type ? <span className="ml-2 text-xs">{p.type}</span> : null}
                </li>
              ))}
            </ul>
          </section>
          <section className="panel p-5">
            <h2 className="font-semibold">Data safety</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-mist">Collected</p>
                <ul className="mt-2 space-y-1 text-mist">
                  {(dataSafety?.collectedData || []).slice(0, 12).map((item, i) => (
                    <li key={i}>{item.data} {item.purpose ? `· ${item.purpose}` : ""}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-mist">Shared</p>
                <ul className="mt-2 space-y-1 text-mist">
                  {(dataSafety?.sharedData || []).slice(0, 12).map((item, i) => (
                    <li key={i}>{item.data} {item.purpose ? `· ${item.purpose}` : ""}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div className="mt-6 grid gap-4">
          <section className="panel p-5">
            <h2 className="font-semibold">This app’s change timeline</h2>
            <p className="mt-2 text-sm text-mist">
              Only changes for <span className="text-foam">{app.title}</span> — updates, description, screenshots, name, and category — with Old → New data when stored.
            </p>
            <div className="mt-5">
              {!tracked ? (
                <p className="text-sm text-mist">Track this app to start recording its change timeline.</p>
              ) : (
                <ChangeTimeline
                  events={timeline}
                  emptyHint="No changes recorded for this app yet. Sync all or Force reload after the listing changes on Play."
                />
              )}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">Score trend</h2>
            <p className="mt-2 text-sm text-mist">
              Track this app, then refresh to store rating changes over time.
            </p>
            {history.length < 2 ? (
              <p className="mt-6 text-sm text-mist">
                Need at least two snapshots to draw a trend. Track the app and hit Sync all / Force reload.
              </p>
            ) : (
              <div className="mt-6 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="time" stroke="#8aa39a" />
                    <YAxis stroke="#8aa39a" />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#f3c16b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-mist">{label}</dt>
      <dd className="max-w-[60%] text-right break-all">{value}</dd>
    </div>
  );
}

export default function AppDetailPage() {
  return (
    <Suspense fallback={<p className="text-mist">Loading Play Store listing…</p>}>
      <AppDetailPageInner />
    </Suspense>
  );
}
