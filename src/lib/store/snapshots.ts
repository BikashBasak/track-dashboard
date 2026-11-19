import type {
  AccountSnapshot,
  AppDetails,
  AppListingMemory,
  AppSnapshot,
  AppSummary,
  KeywordRank,
  KeywordSnapshot,
  Storefront,
} from "@/lib/playstore/types";

/** Current fingerprint schema. Only same-version values are compared for alerts. */
export const FP_SCHEMA = "3";
const DESC_PREFIX = `d${FP_SCHEMA}:`;
const SHOTS_PREFIX = `s2:`; // screenshots stay on s2 until a dedicated step

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "-",
  "&ndash;": "-",
  "&hellip;": "...",
};

/** Collapse Play / scraper formatting noise before hashing. */
export function normalizeDescription(value?: string | null): string {
  let text = (value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "") // zero-width + soft hyphen
    .replace(/[\u00A0\u202F\u2007\u2060]/g, " ") // nbsp variants
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-");

  text = text.replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g, (entity) => {
    if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
    if (entity.startsWith("&#x") || entity.startsWith("&#X")) {
      const hex = entity.slice(3, -1);
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    }
    if (entity.startsWith("&#")) {
      const code = Number.parseInt(entity.slice(2, -1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    }
    return " ";
  });

  return text
    .replace(/<[^>]+>/g, " ") // stray HTML tags from scraper
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Play CDN URLs churn (=w526-h296, query tokens) while the image id stays the same.
 * Use the stable media id, not the raw URL.
 */
export function stableMediaId(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    const leaf = path.split("/").filter(Boolean).pop() || path;
    return leaf.split("=")[0].split("?")[0];
  } catch {
    const noQuery = raw.split("?")[0];
    const leaf = noQuery.split("/").filter(Boolean).pop() || noQuery;
    return leaf.split("=")[0];
  }
}

export function isDescFingerprintV3(stored?: string | null): boolean {
  return Boolean(stored && stored.startsWith(DESC_PREFIX));
}

/** @deprecated use isDescFingerprintV3 — kept for compactStore reads */
export function isDescFingerprintV2(stored?: string | null): boolean {
  return Boolean(stored && (stored.startsWith("d2:") || stored.startsWith(DESC_PREFIX)));
}

export function isShotsFingerprintV2(stored?: string | null): boolean {
  return Boolean(stored && stored.startsWith(SHOTS_PREFIX));
}

function parseDescFingerprint(stored: string): { length: number; hash: string; sample: string } | null {
  const match = stored.match(/^d[23]:(\d+):([0-9a-f]+):(.*)$/i);
  if (!match) return null;
  return { length: Number(match[1]), hash: match[2].toLowerCase(), sample: match[3] ?? "" };
}

function parseShotsFingerprint(stored: string): { count: number; sample: string } | null {
  const match = stored.match(/^s2:(\d+):[0-9a-f]+:(.*)$/i);
  if (!match) return null;
  return { count: Number(match[1]), sample: match[2] ?? "" };
}

function clipPreview(text: string, max = 140): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

/** Max chars of description body kept for Old→New display (localStorage-safe). */
export const DESC_TEXT_CAP = 4000;

/** Normalized description body for display / diff (capped). */
export function descriptionBody(value?: string | null): string | null {
  const text = normalizeDescription(value);
  if (!text) return null;
  if (text.length <= DESC_TEXT_CAP) return text;
  return `${text.slice(0, DESC_TEXT_CAP).trimEnd()}…`;
}

/**
 * Extract phrases present in the new description but not matched in the old one
 * (sequential word walk — good enough for “what was added”).
 */
export function descriptionAddedText(oldText?: string | null, newText?: string | null): string | null {
  const a = normalizeDescription(oldText);
  const b = normalizeDescription(newText);
  if (!b || a === b) return null;
  if (!a) return b.length > DESC_TEXT_CAP ? `${b.slice(0, DESC_TEXT_CAP).trimEnd()}…` : b;
  if (b.startsWith(a)) {
    const rest = b.slice(a.length).trim();
    return rest || null;
  }

  const oldWords = a.split(/\s+/).filter(Boolean);
  const newWords = b.split(/\s+/).filter(Boolean);
  let oi = 0;
  const runs: string[][] = [];
  let current: string[] = [];

  for (const word of newWords) {
    let found = -1;
    const limit = Math.min(oldWords.length, oi + 48);
    for (let j = oi; j < limit; j++) {
      if (oldWords[j] === word) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      if (current.length) {
        runs.push(current);
        current = [];
      }
      oi = found + 1;
    } else {
      current.push(word);
    }
  }
  if (current.length) runs.push(current);

  const phrases = runs
    .map((run) => run.join(" ").trim())
    .filter((p) => p.length >= 3);
  if (!phrases.length) return null;
  const joined = phrases.join(" · ");
  return joined.length > DESC_TEXT_CAP ? `${joined.slice(0, DESC_TEXT_CAP).trimEnd()}…` : joined;
}

/** Full Old / New / Added labels for description alerts. */
export function descriptionChangeDetail(
  storedFp?: string | null,
  storedText?: string | null,
  liveDescription?: string | null,
): { from: string; to: string; added: string | null } | null {
  const liveText = descriptionBody(liveDescription);
  if (!liveText) return null;

  let fromText = (storedText ?? "").trim();
  if (!fromText && isDescFingerprintV3(storedFp)) {
    const prev = parseDescFingerprint(storedFp!);
    if (prev?.sample) {
      fromText = `${prev.sample}${prev.length > prev.sample.length ? "…" : ""} (${prev.length} chars — full prior text not stored yet; next change will keep full Old)`;
    }
  }
  if (!fromText) fromText = "(no prior description stored)";

  return {
    from: fromText,
    to: liveText,
    added: descriptionAddedText(fromText.includes("full prior text not stored") ? "" : fromText, liveText),
  };
}

/** @deprecated prefer descriptionChangeDetail — kept for callers that only need short labels */
export function descriptionComparePreview(
  stored?: string | null,
  liveDescription?: string | null,
): { from: string; to: string } | null {
  const detail = descriptionChangeDetail(stored, null, liveDescription);
  if (!detail) return null;
  return { from: clipPreview(detail.from, 120), to: clipPreview(detail.to, 140) };
}

/** Human-readable old → new labels for screenshot-set alerts (counts only — no media ids). */
export function screenshotsComparePreview(
  stored?: string | null,
  screenshots?: string[] | null,
): { from: string; to: string } | null {
  if (!isShotsFingerprintV2(stored)) return null;
  const prev = parseShotsFingerprint(stored!);
  const ids = [...new Set((screenshots || []).map(stableMediaId).filter(Boolean))].sort();
  if (!prev) return null;
  return {
    from: `${prev.count} screenshot${prev.count === 1 ? "" : "s"}`,
    to: `${ids.length} screenshot${ids.length === 1 ? "" : "s"}`,
  };
}

/** True when a string looks like a loadable image/video URL. */
export function isLikelyMediaUrl(value?: string | null): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v) || v.startsWith("//")) return true;
  return /\.(png|jpe?g|webp|gif|mp4|webm)(\?|$)/i.test(v);
}

/** Hide fingerprint / CDN id noise that used to appear in Old → New. */
export function isMediaIdNoise(value?: string | null): boolean {
  const v = String(value || "").trim();
  if (!v || isLikelyMediaUrl(v)) return false;
  if (/^https?:\/\//i.test(v)) return false;
  // "3 screenshots · abc, def" or raw id lists
  if (/screenshot/i.test(v) && /[·|]/.test(v)) return true;
  if (/^[A-Za-z0-9_-]{10,}(,\s*[A-Za-z0-9_-]{6,})+$/.test(v)) return true;
  if (/^[A-Za-z0-9_-]{16,}$/.test(v) && !/\s/.test(v)) return true;
  return false;
}

export function mediaAssetChanged(prev?: string | null, next?: string | null): boolean {
  const a = String(prev || "").trim();
  const b = String(next || "").trim();
  if (!a || !b) return false;
  return stableMediaId(a) !== stableMediaId(b);
}

/** How many screenshot URLs to keep so Old and New can be lined up. */
export const SCREENSHOT_PREVIEW_CAP = 8;

export function pickMediaUrls(urls?: Array<string | null | undefined> | null, cap = SCREENSHOT_PREVIEW_CAP): string[] {
  return (urls || []).map((u) => String(u || "").trim()).filter(Boolean).slice(0, cap);
}

/** Compact stable fingerprint for description text. Always writes schema v3. */
export function contentFingerprint(value?: string | null, sample = 32): string | null {
  const text = normalizeDescription(value);
  if (!text) return null;
  return `${DESC_PREFIX}${text.length}:${fnv1a(text)}:${text.slice(0, sample)}`;
}

/** Compact stable fingerprint for screenshot set. Always writes schema v2. */
export function screenshotsFingerprint(screenshots?: string[] | null): string | null {
  if (!screenshots?.length) return null;
  const ids = [...new Set(screenshots.map(stableMediaId).filter(Boolean))].sort();
  if (!ids.length) return null;
  const joined = ids.join("|");
  return `${SHOTS_PREFIX}${ids.length}:${fnv1a(joined)}:${joined.slice(0, 48)}`;
}

/**
 * Keep comparable current fingerprints; drop legacy / opaque values so the next
 * refresh rebaselines quietly instead of false-alerting.
 */
export function asContentFingerprint(stored?: string | null): string | null {
  const value = (stored ?? "").trim();
  if (!value) return null;
  if (isDescFingerprintV3(value)) return value;
  return null;
}

export function asScreenshotsFingerprint(stored?: string | null): string | null {
  const value = (stored ?? "").trim();
  if (!value) return null;
  if (isShotsFingerprintV2(value)) return value;
  return null;
}

/**
 * Alert only when baseline is schema-v3 and live text meaningfully differs.
 * d2 / legacy → quiet rebaseline (no alert). Tiny scraper length noise is ignored.
 */
export function descriptionContentChanged(stored?: string | null, liveDescription?: string | null): boolean {
  if (!isDescFingerprintV3(stored)) return false;
  const liveFp = contentFingerprint(liveDescription);
  if (!liveFp) return false;
  if (stored === liveFp) return false;

  const prev = parseDescFingerprint(stored!);
  const next = parseDescFingerprint(liveFp);
  if (!prev || !next) return stored !== liveFp;

  // Same hash → same normalized body (ignore any format drift).
  if (prev.hash === next.hash) return false;

  // Tiny length churn with identical opening sample → scraper noise, not an edit.
  const delta = Math.abs(prev.length - next.length);
  const maxLen = Math.max(prev.length, next.length, 1);
  if (delta <= 8 && delta / maxLen <= 0.02 && prev.sample === next.sample) return false;

  return true;
}

export function screenshotsContentChanged(stored?: string | null, screenshots?: string[] | null): boolean {
  if (!isShotsFingerprintV2(stored)) return false;
  const liveFp = screenshotsFingerprint(screenshots);
  if (!liveFp) return false;
  return stored !== liveFp;
}

/** True once we have stored a full app listing (not a thin catalog stub). */
export function hasDeepListingBaseline(memory?: AppListingMemory | null): boolean {
  if (!memory) return false;
  return Boolean(
    isDescFingerprintV3(memory.description) ||
      isDescFingerprintV2(memory.description) ||
      isShotsFingerprintV2(memory.screenshotsFp) ||
      memory.version ||
      memory.updated,
  );
}

export function snapshotFromApp(app: AppDetails): AppSnapshot {
  return {
    ts: Date.now(),
    score: app.score,
    ratings: app.ratings ?? null,
    reviews: app.reviews ?? null,
    minInstalls: app.minInstalls ?? null,
    maxInstalls: app.maxInstalls ?? null,
    version: app.version ?? null,
    updated: app.updated ?? null,
    installs: app.installs ?? null,
    recentChanges: app.recentChanges ? app.recentChanges.slice(0, 500) : null,
    title: app.title ?? null,
    genre: app.genre ?? null,
    genreId: app.genreId ?? null,
    description: contentFingerprint(app.description),
    descriptionText: descriptionBody(app.description),
    screenshotsFp: screenshotsFingerprint(app.screenshots),
    screenshotUrls: (app.screenshots || []).filter(Boolean).slice(0, 20),
    icon: app.icon || null,
    headerImage: app.headerImage || null,
    video: app.video || null,
  };
}

export function listingMemoryFromApp(app: AppDetails): AppListingMemory {
  return {
    appId: app.appId,
    title: app.title,
    icon: app.icon,
    developer: app.developer,
    genre: app.genre ?? null,
    genreId: app.genreId ?? null,
    version: app.version ?? null,
    updated: app.updated ?? null,
    description: contentFingerprint(app.description),
    descriptionText: descriptionBody(app.description),
    screenshotsFp: screenshotsFingerprint(app.screenshots),
    screenshotUrls: (app.screenshots || []).filter(Boolean).slice(0, 20),
    headerImage: app.headerImage || null,
    video: app.video || null,
  };
}

export function snapshotFromAccount(apps: AppSummary[], name?: string): AccountSnapshot {
  const scores = apps.map((a) => a.score).filter((s): s is number => typeof s === "number");
  return {
    ts: Date.now(),
    appCount: apps.length,
    avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    totalMinInstalls: apps.reduce((sum, a) => sum + (a.minInstalls ?? 0), 0),
    recentlyUpdatedCount: 0,
    name: name ?? apps[0]?.developer ?? null,
    appIds: apps.map((a) => a.appId),
  };
}

export function snapshotFromKeyword(ranks: KeywordRank[], store: Storefront): KeywordSnapshot {
  return {
    ts: Date.now(),
    country: store.country,
    lang: store.lang,
    ranks: ranks.map((r) => ({ ...r })),
  };
}

export function catalogFromApps(apps: AppSummary[]): AppSummary[] {
  return apps.map((a) => ({
    appId: a.appId,
    title: a.title,
    icon: a.icon,
    score: a.score,
    scoreText: a.scoreText,
    free: a.free,
    priceText: a.priceText,
    developer: a.developer,
    developerId: a.developerId,
    genre: a.genre,
    genreId: a.genreId,
    installs: a.installs,
    minInstalls: a.minInstalls,
    maxInstalls: a.maxInstalls,
    released: a.released,
    url: a.url,
  }));
}

/** Keep Play listing metrics when a thin developer() catalog refresh omits them.
 *  Also keep previous apps missing from this market’s response (geo catalogs). */
export function mergeAccountCatalog(previous: AppSummary[] | undefined, next: AppSummary[]): AppSummary[] {
  const prevById = new Map((previous ?? []).map((app) => [app.appId, app]));
  const merged = catalogFromApps(
    next.map((app) => {
      const prev = prevById.get(app.appId);
      if (!prev) return app;
      return {
        ...prev,
        ...app,
        // Thin developer catalogs often return blank icons — never wipe a good one.
        icon: app.icon || prev.icon,
        score: app.score ?? prev.score,
        scoreText: app.scoreText || prev.scoreText,
        genre: app.genre || prev.genre,
        genreId: app.genreId || prev.genreId,
        installs: app.installs || prev.installs,
        minInstalls: app.minInstalls ?? prev.minInstalls,
        maxInstalls: app.maxInstalls ?? prev.maxInstalls,
        released: app.released || prev.released,
      };
    }),
  );
  const seen = new Set(merged.map((app) => app.appId));
  for (const prev of previous ?? []) {
    if (!prev.appId || seen.has(prev.appId)) continue;
    merged.push(catalogFromApps([prev])[0]);
    seen.add(prev.appId);
  }
  return merged;
}

export function unionAppIds(...lists: Array<Array<string | undefined> | undefined>): string[] {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const id of list || []) if (id) ids.add(id);
  }
  return [...ids];
}
