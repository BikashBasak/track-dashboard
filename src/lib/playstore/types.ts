export type Storefront = {
  country: string;
  lang: string;
};

export type AppCategory = {
  name: string;
  id: string | null;
};

export type AppSummary = {
  appId: string;
  title: string;
  summary?: string;
  icon: string;
  score: number | null;
  scoreText?: string;
  free: boolean;
  priceText?: string;
  developer: string;
  developerId?: string;
  genre?: string;
  genreId?: string;
    installs?: string;
    minInstalls?: number;
    maxInstalls?: number;
    released?: string;
    url?: string;
  };

export type AppDetails = AppSummary & {
  description: string;
  descriptionHTML?: string;
  headerImage?: string;
  screenshots: string[];
  video?: string;
  ratings?: number;
  reviews?: number;
  histogram: Record<string, number>;
  price: number;
  currency?: string;
  offersIAP: boolean;
  IAPRange?: string;
  adSupported: boolean;
  androidVersion?: string;
  androidVersionText?: string;
  contentRating?: string;
  contentRatingDescription?: string;
  released?: string;
  updated?: number;
  version?: string;
  recentChanges?: string;
  privacyPolicy?: string;
  developerEmail?: string;
  developerWebsite?: string;
  developerAddress?: string;
  categories: AppCategory[];
  editorsChoice: boolean;
  preregister: boolean;
  comments: string[];
  url: string;
};

export type ReviewItem = {
  id: string;
  userName: string;
  userImage?: string;
  date: string;
  score: number;
  title?: string;
  text: string;
  url?: string;
  thumbsUp?: number;
  replyDate?: string;
  replyText?: string;
  version?: string;
};

export type PermissionGroup = {
  permission: string;
  type?: string;
};

export type DataSafetyItem = {
  data?: string;
  purpose?: string;
  type?: string;
  optional?: boolean;
};

export type AppSnapshot = {
  ts: number;
  score: number | null;
  ratings: number | null;
  reviews: number | null;
  minInstalls: number | null;
  maxInstalls: number | null;
  version: string | null;
  updated: number | null;
  installs: string | null;
  recentChanges?: string | null;
  title?: string | null;
  genre?: string | null;
  genreId?: string | null;
  /** Fingerprint for change detection (d3:…). */
  description?: string | null;
  /** Normalized description body for Old→New notification display (capped). */
  descriptionText?: string | null;
  screenshotsFp?: string | null;
  /** First few screenshot URLs for timeline previews. */
  screenshotUrls?: string[] | null;
  /** Listing icon URL at snapshot time (for icon-change previews). */
  icon?: string | null;
  /** Feature graphic / banner URL. */
  headerImage?: string | null;
  /** Promo video URL when present. */
  video?: string | null;
};

/** Last known listing fields for apps under a tracked publisher (for account deep sync). */
export type AppListingMemory = {
  appId: string;
  title: string;
  icon: string;
  developer: string;
  genre?: string | null;
  genreId?: string | null;
  version?: string | null;
  updated?: number | null;
  description?: string | null;
  /** Normalized description body for notification Old→New (capped). */
  descriptionText?: string | null;
  screenshotsFp?: string | null;
  screenshotUrls?: string[] | null;
  headerImage?: string | null;
  video?: string | null;
  /** Set when an account scan confirms this catalog app is gone from Play. */
  listingStatus?: "unpublished";
  unpublishedAt?: number | null;
};

export type AccountSnapshot = {
  ts: number;
  appCount: number;
  avgScore: number | null;
  totalMinInstalls: number;
  recentlyUpdatedCount: number;
  name?: string | null;
  appIds?: string[];
};

/** Play listing presence while the app stays on App Tracking. */
export type AppListingStatus = "live" | "unpublished";

export type TrackedApp = {
  appId: string;
  title: string;
  icon: string;
  developer: string;
  developerId?: string;
  addedAt: number;
  categoryId?: string | null;
  genre?: string | null;
  genreId?: string | null;
  /** When Play says gone, stay tracked and mark unpublished (do not move to Remove App). */
  listingStatus?: AppListingStatus;
  unpublishedAt?: number | null;
  snapshots: AppSnapshot[];
};

export type AppTrackCategory = {
  id: string;
  name: string;
  createdAt: number;
};

export type TrackedAccount = {
  developerId: string;
  name: string;
  addedAt: number;
  sampleIcon?: string;
  appCount?: number;
  categoryId?: string | null;
  lastAppIds?: string[];
  catalog?: AppSummary[];
  /** Per-app listing memory for deep Force reload / sync diffs. */
  listingMemory?: Record<string, AppListingMemory>;
  snapshots: AccountSnapshot[];
};

export type PublisherHit = {
  developerId: string;
  name: string;
  sampleIcon?: string;
  appCount: number;
  sampleTitles: string[];
  exact?: boolean;
};

export type AccountTrackCategory = AppTrackCategory;

export type RemovedReason = "untracked" | "play-removed";

export type RemovedApp = TrackedApp & {
  removedAt: number;
  reason: RemovedReason;
  playStatus?: "gone" | "live" | "unknown";
};

export type RemovedAccount = TrackedAccount & {
  removedAt: number;
  reason: RemovedReason;
  playStatus?: "gone" | "live" | "unknown";
};

export type KeywordRank = {
  position: number;
  appId: string;
  title: string;
  icon: string;
  developer: string;
  score: number | null;
  installs?: string;
  minInstalls?: number;
};

export type KeywordSnapshot = {
  ts: number;
  country: string;
  lang: string;
  ranks: KeywordRank[];
};

export type TrackedKeyword = {
  term: string;
  addedAt: number;
  snapshots: KeywordSnapshot[];
};

export type StoreData = {
  apps: TrackedApp[];
  accounts: TrackedAccount[];
  categories: AppTrackCategory[];
  accountCategories: AccountTrackCategory[];
  removedApps: RemovedApp[];
  removedAccounts: RemovedAccount[];
  keywords: TrackedKeyword[];
};

export type DerivedAppMetrics = {
  dailyInstallsEstimate: number | null;
  ageDays: number | null;
  ageLabel: "new" | "fresh" | "aging" | "stale" | "unknown";
  updateAgeDays: number | null;
  reviewToRatingRatio: number | null;
  fiveStarShare: number | null;
};
