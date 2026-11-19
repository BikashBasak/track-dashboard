import { extractDeveloperQuery, isNumericDeveloperId, normalizeMediaUrl } from "@/lib/utils";
import { confirmationCountries } from "@/lib/playstore/markets";
import type {
  AppDetails,
  AppSummary,
  DataSafetyItem,
  PermissionGroup,
  PublisherHit,
  ReviewItem,
  Storefront,
} from "./types";

type GPlay = {
  app: (opts: object) => Promise<Record<string, unknown>>;
  search: (opts: object) => Promise<Record<string, unknown>[]>;
  suggest: (opts: object) => Promise<string[]>;
  developer: (opts: object) => Promise<Record<string, unknown>[]>;
  reviews: (opts: object) => Promise<{ data: Record<string, unknown>[]; nextPaginationToken?: string | null }>;
  similar: (opts: object) => Promise<Record<string, unknown>[]>;
  permissions: (opts: object) => Promise<PermissionGroup[]>;
  datasafety: (opts: object) => Promise<{ sharedData?: DataSafetyItem[]; collectedData?: DataSafetyItem[]; securityPractices?: unknown; privacyPolicyUrl?: string }>;
  list: (opts: object) => Promise<Record<string, unknown>[]>;
  sort: { NEWEST: number; RATING: number; HELPFULNESS: number };
  collection: Record<string, string>;
  category: Record<string, string>;
};

let cached: GPlay | null = null;

async function gplay(): Promise<GPlay> {
  if (cached) return cached;
  const mod = await import("google-play-scraper");
  cached = ((mod as { default?: GPlay }).default ?? mod) as GPlay;
  return cached;
}

function asSummary(raw: Record<string, unknown>): AppSummary {
  return {
    appId: String(raw.appId ?? ""),
    title: String(raw.title ?? "Unknown app"),
    summary: raw.summary ? String(raw.summary) : undefined,
    icon: normalizeMediaUrl(String(raw.icon ?? "")),
    score: typeof raw.score === "number" ? raw.score : null,
    scoreText: raw.scoreText ? String(raw.scoreText) : undefined,
    free: Boolean(raw.free ?? true),
    priceText: raw.priceText ? String(raw.priceText) : undefined,
    developer: String(raw.developer ?? "Unknown"),
    developerId: raw.developerId ? String(raw.developerId) : undefined,
    genre: raw.genre ? String(raw.genre) : undefined,
    genreId: raw.genreId ? String(raw.genreId) : undefined,
    installs: raw.installs ? String(raw.installs) : undefined,
    minInstalls: typeof raw.minInstalls === "number" ? raw.minInstalls : undefined,
    maxInstalls: typeof raw.maxInstalls === "number" ? raw.maxInstalls : undefined,
    released: raw.released ? String(raw.released) : undefined,
    url: raw.url ? String(raw.url) : undefined,
  };
}

function asDetails(raw: Record<string, unknown>): AppDetails {
  const histogramRaw = (raw.histogram ?? {}) as Record<string, number>;
  return {
    ...asSummary(raw),
    description: String(raw.description ?? ""),
    descriptionHTML: raw.descriptionHTML ? String(raw.descriptionHTML) : undefined,
    headerImage: raw.headerImage ? normalizeMediaUrl(String(raw.headerImage)) : undefined,
    screenshots: Array.isArray(raw.screenshots)
      ? raw.screenshots.map((s) => normalizeMediaUrl(String(s))).filter(Boolean)
      : [],
    video: raw.video ? normalizeMediaUrl(String(raw.video)) : undefined,
    maxInstalls: typeof raw.maxInstalls === "number" ? raw.maxInstalls : undefined,
    ratings: typeof raw.ratings === "number" ? raw.ratings : undefined,
    reviews: typeof raw.reviews === "number" ? raw.reviews : undefined,
    histogram: {
      "1": histogramRaw["1"] ?? 0,
      "2": histogramRaw["2"] ?? 0,
      "3": histogramRaw["3"] ?? 0,
      "4": histogramRaw["4"] ?? 0,
      "5": histogramRaw["5"] ?? 0,
    },
    price: typeof raw.price === "number" ? raw.price : 0,
    currency: raw.currency ? String(raw.currency) : undefined,
    offersIAP: Boolean(raw.offersIAP),
    IAPRange: raw.IAPRange ? String(raw.IAPRange) : undefined,
    adSupported: Boolean(raw.adSupported),
    androidVersion: raw.androidVersion ? String(raw.androidVersion) : undefined,
    androidVersionText: raw.androidVersionText ? String(raw.androidVersionText) : undefined,
    contentRating: raw.contentRating ? String(raw.contentRating) : undefined,
    contentRatingDescription: raw.contentRatingDescription
      ? String(raw.contentRatingDescription)
      : undefined,
    released: raw.released ? String(raw.released) : undefined,
    updated: typeof raw.updated === "number" ? raw.updated : undefined,
    version: raw.version ? String(raw.version) : undefined,
    recentChanges: raw.recentChanges ? String(raw.recentChanges) : undefined,
    privacyPolicy: raw.privacyPolicy ? String(raw.privacyPolicy) : undefined,
    developerEmail: raw.developerEmail ? String(raw.developerEmail) : undefined,
    developerWebsite: raw.developerWebsite ? String(raw.developerWebsite) : undefined,
    developerAddress: raw.developerAddress ? String(raw.developerAddress) : undefined,
    categories: Array.isArray(raw.categories)
      ? (raw.categories as { name?: string; id?: string | null }[]).map((c) => ({
          name: String(c.name ?? ""),
          id: c.id ?? null,
        }))
      : [],
    editorsChoice: Boolean(raw.editorsChoice),
    preregister: Boolean(raw.preregister),
    comments: Array.isArray(raw.comments) ? raw.comments.map(String) : [],
    url: String(raw.url ?? ""),
  };
}

function asReview(raw: Record<string, unknown>): ReviewItem {
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    userName: String(raw.userName ?? "Play user"),
    userImage: raw.userImage ? String(raw.userImage) : undefined,
    date: String(raw.date ?? ""),
    score: typeof raw.score === "number" ? raw.score : 0,
    title: raw.title ? String(raw.title) : undefined,
    text: String(raw.text ?? ""),
    url: raw.url ? String(raw.url) : undefined,
    thumbsUp: typeof raw.thumbsUp === "number" ? raw.thumbsUp : undefined,
    replyDate: raw.replyDate ? String(raw.replyDate) : undefined,
    replyText: raw.replyText ? String(raw.replyText) : undefined,
    version: raw.version ? String(raw.version) : undefined,
  };
}

function normalizeDevId(developerId: string) {
  return decodeURIComponent(developerId).replace(/\+/g, " ").trim();
}

export async function searchApps(
  term: string,
  store: Storefront,
  num = 20,
  price: "all" | "free" | "paid" = "all",
): Promise<AppSummary[]> {
  const gp = await gplay();
  const results = await gp.search({
    term,
    num,
    lang: store.lang,
    country: store.country,
    fullDetail: false,
    price,
  });
  return results.map(asSummary);
}

export async function getApp(appId: string, store: Storefront): Promise<AppDetails> {
  const gp = await gplay();
  const raw = await gp.app({ appId, lang: store.lang, country: store.country });
  return asDetails(raw);
}

export async function suggestTerms(term: string, store: Storefront): Promise<string[]> {
  const gp = await gplay();
  return gp.suggest({ term, lang: store.lang, country: store.country });
}

export async function getDeveloperApps(
  developerId: string,
  store: Storefront,
  num = 60,
): Promise<AppSummary[]> {
  const gp = await gplay();
  const results = await gp.developer({
    devId: normalizeDevId(developerId),
    lang: store.lang,
    country: store.country,
    num,
    fullDetail: false,
  });
  return results.map(asSummary);
}

/**
 * Account Tracking: merge publisher catalogs across markets so geo-only apps
 * (live in IN but not US, etc.) are not treated as missing / removed.
 */
export async function getDeveloperAppsMerged(
  developerId: string,
  store: Storefront,
  num = 80,
): Promise<{ apps: AppSummary[]; markets: string[]; name: string }> {
  const countries = confirmationCountries(store.country, 4);
  const byId = new Map<string, AppSummary>();
  const markets: string[] = [];
  let name = "";

  for (const [index, country] of countries.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const apps = await getDeveloperApps(developerId, { country, lang: store.lang }, num);
      if (!apps.length) continue;
      markets.push(country);
      if (!name) name = apps[0]?.developer || "";
      for (const app of apps) {
        if (!app.appId) continue;
        const prev = byId.get(app.appId);
        if (!prev) {
          byId.set(app.appId, app);
          continue;
        }
        byId.set(app.appId, {
          ...prev,
          ...app,
          score: app.score ?? prev.score,
          scoreText: app.scoreText || prev.scoreText,
          genre: app.genre || prev.genre,
          genreId: app.genreId || prev.genreId,
          installs: app.installs || prev.installs,
          minInstalls: app.minInstalls ?? prev.minInstalls,
          maxInstalls: app.maxInstalls ?? prev.maxInstalls,
          released: app.released || prev.released,
          icon: app.icon || prev.icon,
          title: app.title || prev.title,
        });
      }
    } catch {
      // Try next market; empty/404 in one country is normal for geo-limited portfolios.
    }
  }

  return {
    apps: [...byId.values()],
    markets,
    name: name || normalizeDevId(developerId),
  };
}

function publisherFromApps(developerId: string, apps: AppSummary[], exact = false): PublisherHit | null {
  if (!apps.length) return null;
  const name = apps[0]?.developer || developerId;
  return {
    developerId,
    name,
    sampleIcon: apps[0]?.icon,
    appCount: apps.length,
    sampleTitles: apps.slice(0, 3).map((a) => a.title),
    exact,
  };
}

function sameDeveloper(a: string, b: string) {
  return normalizeDevId(a).toLowerCase() === normalizeDevId(b).toLowerCase();
}

export async function searchPublishers(term: string, store: Storefront): Promise<PublisherHit[]> {
  const query = extractDeveloperQuery(term);
  if (query.length < 2) return [];

  try {
    const apps = await getDeveloperApps(query, store, 24);
    const hit = publisherFromApps(normalizeDevId(query), apps, true);
    if (hit) return [hit];
  } catch {
    // Named lookup missed; try an exact-name filter on search results next.
  }

  if (isNumericDeveloperId(query)) return [];

  const apps = await searchApps(query, store, 30).catch(() => [] as AppSummary[]);
  const grouped = new Map<string, PublisherHit>();
  for (const app of apps) {
    const developerId = normalizeDevId(app.developerId || app.developer || "");
    const name = app.developer || developerId;
    if (!developerId) continue;
    if (!sameDeveloper(name, query) && !sameDeveloper(developerId, query)) continue;
    const existing = grouped.get(developerId);
    if (!existing) {
      grouped.set(developerId, {
        developerId,
        name,
        sampleIcon: app.icon,
        appCount: 1,
        sampleTitles: [app.title],
        exact: true,
      });
      continue;
    }
    grouped.set(developerId, {
      ...existing,
      sampleIcon: existing.sampleIcon || app.icon,
      appCount: existing.appCount + 1,
      sampleTitles: [...new Set([...existing.sampleTitles, app.title])].slice(0, 3),
    });
  }
  return [...grouped.values()];
}

export async function getReviews(
  appId: string,
  store: Storefront,
  opts?: { num?: number; paginate?: boolean; nextPaginationToken?: string | null; sort?: "newest" | "rating" | "helpfulness" },
) {
  const gp = await gplay();
  const sortMap = {
    newest: gp.sort.NEWEST,
    rating: gp.sort.RATING,
    helpfulness: gp.sort.HELPFULNESS,
  };
  const result = await gp.reviews({
    appId,
    lang: store.lang,
    country: store.country,
    num: opts?.num ?? 40,
    paginate: opts?.paginate ?? true,
    nextPaginationToken: opts?.nextPaginationToken ?? null,
    sort: sortMap[opts?.sort ?? "newest"],
  });
  return {
    reviews: (result.data || []).map(asReview),
    nextPaginationToken: result.nextPaginationToken ?? null,
  };
}

export async function getSimilar(appId: string, store: Storefront): Promise<AppSummary[]> {
  const gp = await gplay();
  const results = await gp.similar({
    appId,
    lang: store.lang,
    country: store.country,
  });
  return results.map(asSummary);
}

export async function getPermissions(appId: string, store: Storefront) {
  const gp = await gplay();
  return gp.permissions({ appId, lang: store.lang, short: false });
}

export async function getDataSafety(appId: string, store: Storefront) {
  const gp = await gplay();
  return gp.datasafety({ appId, lang: store.lang });
}

export async function getTopCharts(
  collection: "TOP_FREE" | "TOP_PAID" | "GROSSING",
  store: Storefront,
  category?: string,
  num = 18,
): Promise<AppSummary[]> {
  const gp = await gplay();
  const results = await gp.list({
    collection: gp.collection[collection],
    category: category ? gp.category[category] : undefined,
    lang: store.lang,
    country: store.country,
    num,
    fullDetail: false,
  });
  return results.map(asSummary);
}
