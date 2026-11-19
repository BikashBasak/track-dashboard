"use client";

import { AccountAppList } from "@/components/account-app-list";
import { ConceptChart } from "@/components/concept-chart";
import { appConcept } from "@/lib/app-concept";
import { PlayStoreLink } from "@/components/play-store-link";
import { useStorefront } from "@/components/storefront";
import { EmptyState, Metric, PageHeader } from "@/components/ui";
import { useWatchlist } from "@/components/watchlist-context";
import type { AppSummary, TrackedAccount } from "@/lib/playstore/types";
import { openPlayListings } from "@/lib/open-play-tabs";
import { formatNumber, formatScore, developerPlayUrl } from "@/lib/utils";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Payload = {
  developerId: string;
  name: string;
  apps: AppSummary[];
  stats: {
    appCount: number;
    avgScore: number | null;
    totalMinInstalls: number;
    freeCount: number;
    paidCount: number;
    genres: (string | undefined)[];
  };
  tracked: TrackedAccount | null;
};

export default function AccountDetailPage() {
  const params = useParams<{ devId: string }>();
  const developerId = decodeURIComponent(params.devId);
  const { qs, country } = useStorefront();
  const watch = useWatchlist();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<"score" | "installs" | "name" | "age">("installs");
  const [concept, setConcept] = useState<string | null>(null);
  const listedApps = useMemo(() => {
    const apps = data?.apps ?? [];
    if (!concept) return apps;
    return apps.filter((app) => appConcept(app.title) === concept);
  }, [data?.apps, concept]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/developers/${encodeURIComponent(developerId)}?${qs}&mergeMarkets=1`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        if (!cancelled) setData(json);
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
  }, [developerId, qs]);

  async function toggleTrack() {
    if (!data) return;
    setBusy(true);
    try {
      const already = watch.getTrackedAccount(developerId);
      if (already) {
        watch.untrackAccountLocal(developerId);
        fetch(`/api/watchlist?type=account&id=${encodeURIComponent(developerId)}`, { method: "DELETE" }).catch(
          () => undefined,
        );
      } else {
        watch.trackAccountLocal({
          developerId,
          name: data.name,
          sampleIcon: data.apps[0]?.icon,
          apps: data.apps,
        });
        fetch(`/api/watchlist?${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "account", developerId, name: data.name }),
        }).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-mist">Loading publisher catalog…</p>;
  if (error || !data) return <EmptyState title="Publisher not found" body={error || "Play Store did not return a developer catalog for this id."} />;

  return (
    <div>
      <PageHeader
        eyebrow="Account Tracking"
        title={data.name}
        description={developerPlayUrl(data.developerId)}
        actions={
          <div className="flex flex-wrap gap-2">
            <PlayStoreLink href={developerPlayUrl(data.developerId)} label="Open this account on Play Store" compact={false} />
            <button
              onClick={() => void toggleTrack()}
              disabled={busy}
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
            >
              {watch.getTrackedAccount(developerId) ? "Remove from tracking" : "Track this account"}
            </button>
            {watch.data.accountCategories.length > 0 ? (
              <select
                value={
                  watch.getTrackedAccount(developerId)
                    ? watch.getTrackedAccount(developerId)?.categoryId ?? ""
                    : watch.lastAccountCategoryId ?? ""
                }
                onChange={(e) => {
                  const categoryId = e.target.value || null;
                  const already = watch.getTrackedAccount(developerId);
                  if (!already) {
                    watch.trackAccountLocal({
                      developerId,
                      name: data.name,
                      sampleIcon: data.apps[0]?.icon,
                      apps: data.apps,
                      categoryId,
                    });
                  } else {
                    watch.setAccountCategory(developerId, categoryId);
                  }
                }}
                className="h-10 rounded-xl border border-white/15 bg-[#0d1b26] px-3 text-sm"
                aria-label="Account category"
              >
                <option value="">Choose category</option>
                {watch.data.accountCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Published apps" value={data.stats.appCount} />
        <Metric label="Average rating" value={formatScore(data.stats.avgScore)} />
        <Metric label="Install footprint" value={formatNumber(data.stats.totalMinInstalls)} hint="Sum of min install bands" />
        <Metric label="Monetization mix" value={`${data.stats.freeCount} free`} hint={`${data.stats.paidCount} paid`} />
      </div>

      <div className="mt-6">
        <ConceptChart
          titles={data.apps.map((app) => app.title)}
          heading="Uploaded concepts"
          hint="Click a bar to list only those apps, then Open all on Play. Click the bar again, or Show all apps, to clear it."
          selected={concept}
          onSelect={setConcept}
          onOpen={() => {
            openPlayListings(
              listedApps.map((app) => app.appId),
              country,
            );
          }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {data.stats.genres.filter(Boolean).slice(0, 8).map((genre) => (
            <span key={genre} className="rounded-full bg-white/8 px-3 py-1 text-xs text-mist">
              {genre}
            </span>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-10 rounded-xl border border-white/10 bg-[#0d1b26] px-3 text-sm"
        >
          <option value="installs">Sort by installs</option>
          <option value="score">Sort by rating</option>
          <option value="age">Sort by age</option>
          <option value="name">Sort by name</option>
        </select>
      </div>

      <div className="mt-5">
        <AccountAppList apps={listedApps} sort={sort} showScreenshots compact />
      </div>
    </div>
  );
}
