import type { AppDetails, DerivedAppMetrics } from "./types";

const DAY = 1000 * 60 * 60 * 24;

/**
 * Play's precise install count (protobuf `maxInstalls`), not the "10,000,000+" band.
 * AsoSpy overlays use this same public listing figure for D/I.
 */
export function playRealInstalls(app: Partial<AppDetails>): number | null {
  if (typeof app.maxInstalls === "number" && app.maxInstalls > 0) return app.maxInstalls;
  if (typeof app.minInstalls === "number" && app.minInstalls > 0) return app.minInstalls;
  return null;
}

/** Whole calendar days since Play's Released date, in the server/browser local calendar. */
export function ageDaysSinceRelease(released?: string | null): number | null {
  if (!released) return null;
  const releasedMs = Date.parse(released);
  if (!Number.isFinite(releasedMs)) return null;
  const releasedDate = new Date(releasedMs);
  const now = new Date();
  const start = Date.UTC(releasedDate.getFullYear(), releasedDate.getMonth(), releasedDate.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((today - start) / DAY));
}

/**
 * AsoSpy-style D/I: precise Play installs ÷ days since Released, rounded.
 * Not a paid estimate. AsoSpy has no public API; this matches the overlay formula.
 */
export function asoSpyDailyInstalls(realInstalls: number | null, ageDays: number | null): number | null {
  if (!realInstalls || !ageDays) return null;
  return Math.round(realInstalls / ageDays);
}

export function deriveAppMetrics(app: Partial<AppDetails>): DerivedAppMetrics {
  const ageDays = ageDaysSinceRelease(app.released);

  const updateAgeDays =
    typeof app.updated === "number"
      ? Math.max(0, Math.round((Date.now() - app.updated) / DAY))
      : null;

  const realInstalls = playRealInstalls(app);

  let ageLabel: DerivedAppMetrics["ageLabel"] = "unknown";
  if (ageDays != null) {
    if (ageDays <= 30) ageLabel = "new";
    else if (ageDays <= 180) ageLabel = "fresh";
    else if (ageDays <= 730) ageLabel = "aging";
    else ageLabel = "stale";
  }

  const histogram = app.histogram || {};
  const totalStars = Object.values(histogram).reduce((sum, n) => sum + (n || 0), 0);
  const fiveStarShare = totalStars ? (histogram["5"] || 0) / totalStars : null;
  const reviewToRatingRatio =
    app.ratings && app.reviews ? app.reviews / app.ratings : null;

  return {
    dailyInstallsEstimate: asoSpyDailyInstalls(realInstalls, ageDays),
    ageDays,
    ageLabel,
    updateAgeDays,
    reviewToRatingRatio,
    fiveStarShare,
  };
}

export function formatAgeDays(days: number | null | undefined) {
  if (days == null) return "—";
  if (days < 60) return `${days}d`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))}mo`;
  const years = days / 365;
  return years < 10 ? `${years.toFixed(1)}y` : `${Math.round(years)}y`;
}

export function ageBadgeCopy(label: DerivedAppMetrics["ageLabel"]) {
  switch (label) {
    case "new":
      return { text: "New", hint: "Released in the last 30 days" };
    case "fresh":
      return { text: "Fresh", hint: "Released in the last 6 months" };
    case "aging":
      return { text: "Established", hint: "On the store for 6–24 months" };
    case "stale":
      return { text: "Mature", hint: "On the store for 2+ years" };
    default:
      return { text: "Unknown age", hint: "Release date not published" };
  }
}

export function updateFreshness(days: number | null) {
  if (days == null) return { text: "Unknown", tone: "muted" as const };
  if (days <= 7) return { text: "Updated this week", tone: "good" as const };
  if (days <= 30) return { text: "Updated this month", tone: "good" as const };
  if (days <= 90) return { text: "Updated this quarter", tone: "warn" as const };
  return { text: "Needs attention", tone: "bad" as const };
}
