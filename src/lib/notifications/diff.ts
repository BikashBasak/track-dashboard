import type { AppDetails, AppListingMemory, AppSummary, RemovedApp, RemovedReason, TrackedAccount, TrackedApp } from "@/lib/playstore/types";
import type { NotificationDraft } from "@/lib/notifications/types";
import {
  contentFingerprint,
  descriptionChangeDetail,
  descriptionContentChanged,
  hasDeepListingBaseline,
  mediaAssetChanged,
  pickMediaUrls,
  screenshotsComparePreview,
  screenshotsContentChanged,
  screenshotsFingerprint,
} from "@/lib/store/snapshots";

function norm(value?: string | null) {
  return (value ?? "").trim();
}

function titlesEqual(a: string, b: string) {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

function fp(parts: Array<string | number | null | undefined>) {
  return parts.map((p) => String(p ?? "")).join("|");
}

function appHref(appId: string) {
  return `/apps/${encodeURIComponent(appId)}`;
}

function accountHref(developerId: string) {
  return `/accounts/${encodeURIComponent(developerId)}`;
}

export function diffApp(prev: TrackedApp, live: AppDetails): NotificationDraft[] {
  const items: NotificationDraft[] = [];
  const last = prev.snapshots.at(-1);
  const icon = live.icon || prev.icon;
  const publisherId = live.developerId || prev.developerId || null;

  const oldTitle = norm(prev.title);
  const newTitle = norm(live.title);
  if (oldTitle && newTitle && !titlesEqual(oldTitle, newTitle)) {
    items.push({
      kind: "app-name",
      title: "App name changed",
      body: `${oldTitle} is now ${newTitle}`,
      href: appHref(live.appId),
      entityId: live.appId,
      entityLabel: newTitle,
      icon,
      publisherId,
      from: oldTitle,
      to: newTitle,
      fingerprint: fp(["app-name", live.appId, oldTitle, newTitle]),
    });
  }

  const oldGenre = norm(prev.genre ?? last?.genre);
  const newGenre = norm(live.genre);
  const oldGenreId = norm(prev.genreId ?? last?.genreId);
  const newGenreId = norm(live.genreId);
  if (oldGenre && newGenre) {
    const categoryChanged =
      oldGenreId && newGenreId ? oldGenreId !== newGenreId : oldGenre !== newGenre;
    if (categoryChanged) {
      items.push({
        kind: "app-category",
        title: "Category changed",
        body: `${newTitle || oldTitle} moved from ${oldGenre} to ${newGenre}`,
        href: appHref(live.appId),
        entityId: live.appId,
        entityLabel: newTitle || oldTitle,
        icon,
        publisherId,
        from: oldGenre,
        to: newGenre,
        fingerprint: fp(["app-category", live.appId, oldGenre, newGenre, oldGenreId, newGenreId]),
      });
    }
  }

  const oldVersion = norm(last?.version);
  const newVersion = norm(live.version);
  const versionChanged = Boolean(oldVersion && newVersion && oldVersion !== newVersion);
  if (versionChanged) {
    items.push({
      kind: "app-update",
      title: "App updated",
      body: `${newTitle || oldTitle} updated to ${newVersion}`,
      href: appHref(live.appId),
      entityId: live.appId,
      entityLabel: newTitle || oldTitle,
      icon,
      publisherId,
      from: oldVersion,
      to: newVersion,
      fingerprint: fp(["app-update", live.appId, oldVersion, newVersion]),
    });
  }

  const newDescription = contentFingerprint(live.description) || "";
  if (descriptionContentChanged(last?.description, live.description)) {
    const compare = descriptionChangeDetail(last?.description, last?.descriptionText, live.description);
    items.push({
      kind: "app-description",
      title: "Description changed",
      body: `${newTitle || oldTitle} updated its Play Store description`,
      href: appHref(live.appId),
      entityId: live.appId,
      entityLabel: newTitle || oldTitle,
      icon,
      publisherId,
      from: compare?.from ?? null,
      to: compare?.to ?? null,
      added: compare?.added ?? null,
      fingerprint: fp(["app-description", live.appId, last?.description ?? "", newDescription]),
    });
  }

  const newShots = screenshotsFingerprint(live.screenshots) || "";
  if (screenshotsContentChanged(last?.screenshotsFp, live.screenshots)) {
    const compare = screenshotsComparePreview(last?.screenshotsFp, live.screenshots);
    items.push({
      kind: "app-screenshots",
      title: "Screenshots changed",
      body: `${newTitle || oldTitle} changed its Play Store screenshots`,
      href: appHref(live.appId),
      entityId: live.appId,
      entityLabel: newTitle || oldTitle,
      icon,
      publisherId,
      from: compare?.from ?? null,
      to: compare?.to ?? null,
      mediaBefore: pickMediaUrls(last?.screenshotUrls),
      mediaAfter: pickMediaUrls(live.screenshots),
      mediaKind: "screenshots",
      fingerprint: fp(["app-screenshots", live.appId, last?.screenshotsFp ?? "", newShots]),
    });
  }

  const prevIcon = last?.icon || prev.icon;
  if (mediaAssetChanged(prevIcon, live.icon)) {
    items.push({
      kind: "app-screenshots",
      title: "Icon changed",
      body: `${newTitle || oldTitle} changed its Play Store icon`,
      href: appHref(live.appId),
      entityId: live.appId,
      entityLabel: newTitle || oldTitle,
      icon: live.icon || icon,
      publisherId,
      from: "Previous icon",
      to: "New icon",
      mediaBefore: pickMediaUrls([prevIcon], 1),
      mediaAfter: pickMediaUrls([live.icon], 1),
      mediaKind: "icon",
      fingerprint: fp(["app-icon", live.appId, prevIcon, live.icon]),
    });
  }

  const prevBanner = last?.headerImage || null;
  const liveBanner = live.headerImage || null;
  if (mediaAssetChanged(prevBanner, liveBanner)) {
    items.push({
      kind: "app-screenshots",
      title: "Banner changed",
      body: `${newTitle || oldTitle} changed its feature graphic / banner`,
      href: appHref(live.appId),
      entityId: live.appId,
      entityLabel: newTitle || oldTitle,
      icon,
      publisherId,
      from: "Previous banner",
      to: "New banner",
      mediaBefore: pickMediaUrls([prevBanner], 1),
      mediaAfter: pickMediaUrls([liveBanner], 1),
      mediaKind: "banner",
      fingerprint: fp(["app-banner", live.appId, prevBanner, liveBanner]),
    });
  }

  const prevVideo = last?.video || null;
  const liveVideo = live.video || null;
  if (mediaAssetChanged(prevVideo, liveVideo)) {
    items.push({
      kind: "app-screenshots",
      title: "Promo video changed",
      body: `${newTitle || oldTitle} changed its Play Store promo video`,
      href: appHref(live.appId),
      entityId: live.appId,
      entityLabel: newTitle || oldTitle,
      icon,
      publisherId,
      from: "Previous video",
      to: "New video",
      mediaBefore: pickMediaUrls([prevVideo], 1),
      mediaAfter: pickMediaUrls([liveVideo], 1),
      mediaKind: "video",
      fingerprint: fp(["app-video", live.appId, prevVideo, liveVideo]),
    });
  }

  return items;
}

/** Diff a publisher catalog app using stored listing memory (Account Tracking deep sync). */
export function diffListingMemory(prev: AppListingMemory | undefined, live: AppDetails): NotificationDraft[] {
  // Thin catalog stubs (title only) must seed a baseline, not fire description/screenshot alerts.
  if (!hasDeepListingBaseline(prev)) return [];
  const memory = prev!;
  const fake: TrackedApp = {
    appId: memory.appId,
    title: memory.title,
    icon: memory.icon,
    developer: memory.developer,
    addedAt: 0,
    genre: memory.genre ?? null,
    genreId: memory.genreId ?? null,
    snapshots: [
      {
        ts: 0,
        score: null,
        ratings: null,
        reviews: null,
        minInstalls: null,
        maxInstalls: null,
        version: memory.version ?? null,
        updated: memory.updated ?? null,
        installs: null,
        title: memory.title,
        genre: memory.genre ?? null,
        genreId: memory.genreId ?? null,
        description: memory.description ?? null,
        descriptionText: memory.descriptionText ?? null,
        screenshotsFp: memory.screenshotsFp ?? null,
        screenshotUrls: memory.screenshotUrls ?? null,
        icon: memory.icon || null,
        headerImage: memory.headerImage ?? null,
        video: memory.video ?? null,
      },
    ],
  };
  return diffApp(fake, live);
}

function knownAccountAppIds(prev: TrackedAccount): Set<string> {
  const ids = new Set<string>();
  for (const id of prev.lastAppIds || []) if (id) ids.add(id);
  for (const id of prev.snapshots.at(-1)?.appIds || []) if (id) ids.add(id);
  for (const app of prev.catalog || []) if (app.appId) ids.add(app.appId);
  for (const id of Object.keys(prev.listingMemory || {})) if (id) ids.add(id);
  return ids;
}

/** Incomplete → fuller catalog looks like many “new” apps; treat as baseline fill, not publishes. */
export function isCatalogFillIn(prevCount: number, liveCount: number, newlySeen: number): boolean {
  if (prevCount <= 0) return true;
  if (newlySeen <= 0) return false;
  if (liveCount >= prevCount * 2 && newlySeen >= 3) return true;
  if (newlySeen >= 8) return true;
  return false;
}

function releasedAtMs(released?: string | null): number | null {
  if (!released) return null;
  const ts = Date.parse(released);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * True only when this looks like a real new publish — not a geo/catalog rediscovery.
 * Apps released before we tracked the account (or long before last sync) are discoveries.
 * Missing Play Released date → treat as discovery (seed quietly), not a publish alert.
 */
export function isLikelyNewPublish(
  app: AppSummary,
  account: TrackedAccount,
): boolean {
  const released = releasedAtMs(app.released);
  if (released == null) return false;
  if (account.addedAt && released < account.addedAt - 24 * 60 * 60 * 1000) return false;
  const lastSnapTs = account.snapshots.at(-1)?.ts;
  // Already on Play for a week+ before our last catalog snapshot → not a fresh publish.
  if (lastSnapTs && released < lastSnapTs - 7 * 24 * 60 * 60 * 1000) return false;
  return true;
}

function isPublisherIdLabel(value: string, developerId: string): boolean {
  const label = norm(value).toLowerCase();
  const id = norm(developerId).toLowerCase();
  if (!label || !id) return false;
  if (label === id) return true;
  // Play numeric developer IDs often get stored as the "name" until a display name is known.
  if (/^\d{6,}$/.test(label) && (label === id || id.includes(label) || label.includes(id))) return true;
  return false;
}

/** True only for a real publisher display-name rename — not ID→name fill-in on the same developerId. */
export function isRealAccountNameChange(
  developerId: string,
  oldName: string,
  newName: string,
): boolean {
  const from = norm(oldName);
  const to = norm(newName);
  if (!from || !to || titlesEqual(from, to)) return false;
  if (isPublisherIdLabel(from, developerId) || isPublisherIdLabel(to, developerId)) return false;
  return true;
}

export function diffAccount(
  prev: TrackedAccount,
  live: { name: string; apps: AppSummary[] },
): NotificationDraft[] {
  const items: NotificationDraft[] = [];
  const icon = live.apps[0]?.icon || prev.sampleIcon;
  const oldName = norm(prev.name);
  const newName = norm(live.name);

  if (isRealAccountNameChange(prev.developerId, oldName, newName)) {
    items.push({
      kind: "account-name",
      title: "Account name changed",
      body: `${oldName} is now ${newName}`,
      href: accountHref(prev.developerId),
      entityId: prev.developerId,
      entityLabel: newName,
      icon,
      publisherId: prev.developerId,
      from: oldName,
      to: newName,
      fingerprint: fp(["account-name", prev.developerId, oldName, newName]),
    });
  }

  const known = knownAccountAppIds(prev);
  const prevCount = known.size;
  const liveApps = live.apps.filter((app) => app.appId);
  const unseen = liveApps.filter((app) => !known.has(app.appId));
  const candidateNew = unseen.filter((app) => isLikelyNewPublish(app, prev));
  const allowNewAppAlerts = !isCatalogFillIn(prevCount, liveApps.length, unseen.length);

  const prevById = new Map((prev.catalog || []).map((app) => [app.appId, app]));
  for (const [appId, memory] of Object.entries(prev.listingMemory || {})) {
    if (!prevById.has(appId)) {
      prevById.set(appId, {
        appId: memory.appId,
        title: memory.title,
        icon: memory.icon,
        score: null,
        free: true,
        developer: memory.developer,
        genre: memory.genre ?? undefined,
        genreId: memory.genreId ?? undefined,
      });
    }
  }

  const newAppIds = new Set(allowNewAppAlerts ? candidateNew.map((app) => app.appId) : []);

  for (const app of liveApps) {
    if (newAppIds.has(app.appId)) {
      items.push({
        kind: "account-new-app",
        title: "New app in account",
        body: `${newName || oldName} published ${app.title}`,
        href: appHref(app.appId),
        entityId: prev.developerId,
        entityLabel: newName || oldName,
        icon: app.icon,
        publisherId: prev.developerId,
        relatedAppId: app.appId,
        to: app.title,
        fingerprint: fp(["account-new-app", prev.developerId, app.appId]),
      });
      continue;
    }

    const old = prevById.get(app.appId);
    if (!old) continue;
    const oldTitle = norm(old.title);
    const newTitle = norm(app.title);
    if (oldTitle && newTitle && !titlesEqual(oldTitle, newTitle)) {
      items.push({
        kind: "app-name",
        title: "App name changed",
        body: `${oldTitle} is now ${newTitle}`,
        href: appHref(app.appId),
        entityId: app.appId,
        entityLabel: newTitle,
        icon: app.icon || old.icon,
        publisherId: app.developerId || prev.developerId,
        from: oldTitle,
        to: newTitle,
        fingerprint: fp(["app-name", app.appId, oldTitle, newTitle]),
      });
    }
    const oldGenre = norm(old.genre);
    const newGenre = norm(app.genre);
    const oldGenreId = norm(old.genreId);
    const newGenreId = norm(app.genreId);
    if (oldGenre && newGenre && oldGenre !== newGenre) {
      // If genreIds exist and match, name-only drift is ignoreable.
      if (oldGenreId && newGenreId && oldGenreId === newGenreId) continue;
      items.push({
        kind: "app-category",
        title: "Category changed",
        body: `${newTitle || oldTitle} moved from ${oldGenre} to ${newGenre}`,
        href: appHref(app.appId),
        entityId: app.appId,
        entityLabel: newTitle || oldTitle,
        icon: app.icon || old.icon,
        publisherId: app.developerId || prev.developerId,
        from: oldGenre,
        to: newGenre,
        fingerprint: fp(["app-category", app.appId, oldGenre, newGenre]),
      });
    }
  }

  return items;
}

export function draftAppRepublished(
  app: { appId: string; title: string; icon?: string | null; developerId?: string | null },
  marker?: string | number | null,
): NotificationDraft {
  const title = norm(app.title) || app.appId;
  return {
    kind: "app-republished",
    title: "App republished",
    body: `${title} is back on Google Play`,
    href: appHref(app.appId),
    entityId: app.appId,
    entityLabel: title,
    icon: app.icon || null,
    publisherId: app.developerId ?? null,
    from: "unpublished",
    to: "live",
    fingerprint: fp(["app-republished", app.appId, marker ?? ""]),
  };
}

/** Shared marker so app scan and account scan dedupe the same republish. */
export function republishMarker(
  tracked?: TrackedApp | null,
  memory?: AppListingMemory | null,
  removed?: RemovedApp | null,
): string | number | null {
  if (tracked?.listingStatus === "unpublished") return tracked.unpublishedAt ?? `tracked:${tracked.appId}`;
  if (memory?.listingStatus === "unpublished") return memory.unpublishedAt ?? `catalog:${memory.appId}`;
  if (
    removed &&
    removed.playStatus !== "live" &&
    (removed.reason === "play-removed" || removed.playStatus === "gone")
  ) {
    return removed.removedAt;
  }
  return null;
}

/** Play-gone while still on App Tracking — does not move the app to Remove App. */
export function draftAppUnpublished(app: TrackedApp): NotificationDraft {
  return {
    kind: "app-removed",
    title: "App unpublished",
    body: `${app.title} is no longer listed on Google Play — kept on App Tracking as unpublished`,
    href: appHref(app.appId),
    entityId: app.appId,
    entityLabel: app.title,
    icon: app.icon,
    publisherId: app.developerId ?? null,
    from: "live",
    to: "unpublished",
    fingerprint: fp(["app-unpublished", app.appId]),
  };
}

export function draftAppRemoved(app: TrackedApp, reason: RemovedReason = "play-removed"): NotificationDraft {
  const untracked = reason === "untracked";
  return {
    kind: "app-removed",
    title: untracked ? "App removed from tracking" : "App removed from Play",
    body: untracked
      ? `${app.title} was removed from App Tracking.`
      : `${app.title} is no longer listed on Google Play`,
    href: appHref(app.appId),
    entityId: app.appId,
    entityLabel: app.title,
    icon: app.icon,
    publisherId: app.developerId ?? null,
    fingerprint: fp([untracked ? "app-untracked" : "app-removed", app.appId]),
  };
}

export function draftAccountRemoved(account: TrackedAccount, reason: RemovedReason = "play-removed"): NotificationDraft {
  const untracked = reason === "untracked";
  return {
    kind: "account-removed",
    title: untracked ? "Account removed from tracking" : "Account removed from Play",
    body: untracked
      ? `${account.name} was removed from Account Tracking.`
      : `${account.name} is no longer listed on Google Play`,
    href: accountHref(account.developerId),
    entityId: account.developerId,
    entityLabel: account.name,
    icon: account.sampleIcon,
    publisherId: account.developerId,
    fingerprint: fp([untracked ? "account-untracked" : "account-removed", account.developerId]),
  };
}
