import type { NotificationItem } from "@/lib/notifications/types";
import type { AppSnapshot, TrackedApp } from "@/lib/playstore/types";
import {
  descriptionAddedText,
  mediaAssetChanged,
  pickMediaUrls,
} from "@/lib/store/snapshots";

export type TimelineEventKind =
  | "tracked"
  | "app-name"
  | "app-category"
  | "app-update"
  | "app-description"
  | "app-screenshots"
  | "unpublished"
  | "republished"
  | "app-removed"
  | "score"
  | "installs";

export type TimelineMediaKind = "screenshots" | "icon" | "banner" | "video";

export type TimelineEvent = {
  id: string;
  ts: number;
  kind: TimelineEventKind;
  title: string;
  summary: string;
  appId: string;
  appTitle: string;
  icon?: string | null;
  from?: string | null;
  to?: string | null;
  added?: string | null;
  /** Media URLs after change (screenshots / icon / banner / video). */
  screenshots?: string[] | null;
  screenshotsBefore?: string[] | null;
  mediaKind?: TimelineMediaKind | null;
  recentChanges?: string | null;
};

function norm(value?: string | null) {
  return (value ?? "").trim();
}

function titlesEqual(a: string, b: string) {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseShotsCount(fp?: string | null): number | null {
  if (!fp) return null;
  const m = fp.match(/^s2:(\d+):/i);
  return m ? Number(m[1]) : null;
}

function pushEvent(events: TimelineEvent[], event: TimelineEvent) {
  events.push(event);
}

/** Diff two consecutive snapshots into timeline events. */
function eventsFromSnapshotPair(
  app: TrackedApp,
  prev: AppSnapshot,
  next: AppSnapshot,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const ts = next.ts;
  const base = {
    ts,
    appId: app.appId,
    appTitle: next.title || app.title,
    icon: next.icon || app.icon,
  };

  const oldTitle = norm(prev.title);
  const newTitle = norm(next.title);
  if (oldTitle && newTitle && !titlesEqual(oldTitle, newTitle)) {
    pushEvent(events, {
      ...base,
      id: `name-${app.appId}-${ts}`,
      kind: "app-name",
      title: "App name changed",
      summary: `${oldTitle} → ${newTitle}`,
      from: oldTitle,
      to: newTitle,
    });
  }

  const oldGenre = norm(prev.genre);
  const newGenre = norm(next.genre);
  if (oldGenre && newGenre && oldGenre !== newGenre) {
    if (!(prev.genreId && next.genreId && prev.genreId === next.genreId)) {
      pushEvent(events, {
        ...base,
        id: `genre-${app.appId}-${ts}`,
        kind: "app-category",
        title: "Category changed",
        summary: `${oldGenre} → ${newGenre}`,
        from: oldGenre,
        to: newGenre,
      });
    }
  }

  const oldVersion = norm(prev.version);
  const newVersion = norm(next.version);
  if (oldVersion && newVersion && oldVersion !== newVersion) {
    pushEvent(events, {
      ...base,
      id: `version-${app.appId}-${ts}`,
      kind: "app-update",
      title: "App updated",
      summary: `Version ${oldVersion} → ${newVersion}`,
      from: oldVersion,
      to: newVersion,
      recentChanges: next.recentChanges ?? null,
    });
  } else if (prev.updated && next.updated && prev.updated !== next.updated && !oldVersion) {
    pushEvent(events, {
      ...base,
      id: `updated-${app.appId}-${ts}`,
      kind: "app-update",
      title: "Listing updated",
      summary: "Play Store last-updated date changed",
      recentChanges: next.recentChanges ?? null,
    });
  }

  if (prev.description && next.description && prev.description !== next.description) {
    const fromText = prev.descriptionText || null;
    const toText = next.descriptionText || null;
    pushEvent(events, {
      ...base,
      id: `desc-${app.appId}-${ts}`,
      kind: "app-description",
      title: "Description changed",
      summary: toText
        ? `Description updated (${toText.length} chars)`
        : "Play Store description text changed",
      from: fromText,
      to: toText,
      added: fromText && toText ? descriptionAddedText(fromText, toText) : null,
    });
  }

  if (prev.screenshotsFp && next.screenshotsFp && prev.screenshotsFp !== next.screenshotsFp) {
    const beforeCount = parseShotsCount(prev.screenshotsFp);
    const afterCount = parseShotsCount(next.screenshotsFp);
    pushEvent(events, {
      ...base,
      id: `shots-${app.appId}-${ts}`,
      kind: "app-screenshots",
      title: "Screenshots changed",
      summary:
        beforeCount != null && afterCount != null
          ? `${beforeCount} → ${afterCount} screenshots`
          : "Screenshot set changed on Play Store",
      from: beforeCount != null ? `${beforeCount} screenshots` : null,
      to: afterCount != null ? `${afterCount} screenshots` : null,
      screenshotsBefore: pickMediaUrls(prev.screenshotUrls),
      screenshots: pickMediaUrls(next.screenshotUrls),
      mediaKind: "screenshots",
    });
  }

  if (mediaAssetChanged(prev.icon, next.icon)) {
    pushEvent(events, {
      ...base,
      id: `icon-${app.appId}-${ts}`,
      kind: "app-screenshots",
      title: "Icon changed",
      summary: "Play Store app icon changed",
      from: "Previous icon",
      to: "New icon",
      screenshotsBefore: pickMediaUrls([prev.icon], 1),
      screenshots: pickMediaUrls([next.icon], 1),
      mediaKind: "icon",
      icon: next.icon || app.icon,
    });
  }

  if (mediaAssetChanged(prev.headerImage, next.headerImage)) {
    pushEvent(events, {
      ...base,
      id: `banner-${app.appId}-${ts}`,
      kind: "app-screenshots",
      title: "Banner changed",
      summary: "Feature graphic / banner changed",
      from: "Previous banner",
      to: "New banner",
      screenshotsBefore: pickMediaUrls([prev.headerImage], 1),
      screenshots: pickMediaUrls([next.headerImage], 1),
      mediaKind: "banner",
    });
  }

  if (mediaAssetChanged(prev.video, next.video)) {
    pushEvent(events, {
      ...base,
      id: `video-${app.appId}-${ts}`,
      kind: "app-screenshots",
      title: "Promo video changed",
      summary: "Play Store promo video changed",
      from: "Previous video",
      to: "New video",
      screenshotsBefore: pickMediaUrls([prev.video], 1),
      screenshots: pickMediaUrls([next.video], 1),
      mediaKind: "video",
    });
  }

  return events;
}

function nearestSnapshot(app: TrackedApp, ts: number): { prev?: AppSnapshot; next?: AppSnapshot } {
  const snaps = [...(app.snapshots || [])].sort((a, b) => a.ts - b.ts);
  if (!snaps.length) return {};
  let next: AppSnapshot | undefined;
  let prev: AppSnapshot | undefined;
  for (let i = 0; i < snaps.length; i++) {
    if (snaps[i].ts >= ts - 2 * 60 * 1000) {
      next = snaps[i];
      prev = i > 0 ? snaps[i - 1] : undefined;
      break;
    }
  }
  if (!next) {
    next = snaps[snaps.length - 1];
    prev = snaps.length > 1 ? snaps[snaps.length - 2] : undefined;
  }
  return { prev, next };
}

function eventsFromNotifications(
  app: TrackedApp,
  notifications: NotificationItem[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const note of notifications) {
    const forApp =
      note.entityId === app.appId ||
      note.relatedAppId === app.appId ||
      (note.kind === "account-new-app" && note.relatedAppId === app.appId);
    if (!forApp) continue;
    if (
      note.kind !== "app-name" &&
      note.kind !== "app-category" &&
      note.kind !== "app-update" &&
      note.kind !== "app-description" &&
      note.kind !== "app-screenshots" &&
      note.kind !== "app-removed" &&
      note.kind !== "app-republished"
    ) {
      continue;
    }

    const kind: TimelineEventKind =
      note.kind === "app-republished"
        ? "republished"
        : note.kind === "app-removed" && note.to === "unpublished"
          ? "unpublished"
          : (note.kind as TimelineEventKind);

    const mediaKind = note.mediaKind ?? (note.kind === "app-screenshots" ? "screenshots" : null);
    let screenshotsBefore = pickMediaUrls(note.mediaBefore);
    let screenshots = pickMediaUrls(note.mediaAfter);

    if (note.kind === "app-screenshots" && (!screenshotsBefore.length || !screenshots.length)) {
      const { prev, next } = nearestSnapshot(app, note.createdAt);
      if (!screenshotsBefore.length) {
        if (mediaKind === "icon") screenshotsBefore = pickMediaUrls([prev?.icon], 1);
        else if (mediaKind === "banner") screenshotsBefore = pickMediaUrls([prev?.headerImage], 1);
        else if (mediaKind === "video") screenshotsBefore = pickMediaUrls([prev?.video], 1);
        else screenshotsBefore = pickMediaUrls(prev?.screenshotUrls);
      }
      if (!screenshots.length) {
        if (mediaKind === "icon") screenshots = pickMediaUrls([next?.icon || app.icon], 1);
        else if (mediaKind === "banner") screenshots = pickMediaUrls([next?.headerImage], 1);
        else if (mediaKind === "video") screenshots = pickMediaUrls([next?.video], 1);
        else screenshots = pickMediaUrls(next?.screenshotUrls);
      }
    }

    events.push({
      id: `note-${note.id}`,
      ts: note.createdAt,
      kind,
      title: note.title,
      summary: note.body,
      appId: app.appId,
      appTitle: note.entityLabel || app.title,
      icon: note.icon || app.icon,
      from: note.from,
      to: note.to,
      added: note.added,
      screenshotsBefore: screenshotsBefore.length ? screenshotsBefore : null,
      screenshots: screenshots.length ? screenshots : null,
      mediaKind,
    });
  }
  return events;
}

/** Build a newest-first timeline of listing changes for one tracked app. */
export function buildAppTimeline(
  app: TrackedApp,
  notifications: NotificationItem[] = [],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const snaps = [...(app.snapshots || [])].sort((a, b) => a.ts - b.ts);

  if (app.addedAt) {
    events.push({
      id: `tracked-${app.appId}`,
      ts: app.addedAt,
      kind: "tracked",
      title: "Started tracking",
      summary: `${app.title} added to App Tracking`,
      appId: app.appId,
      appTitle: app.title,
      icon: app.icon,
    });
  }

  if (app.listingStatus === "unpublished" && app.unpublishedAt) {
    events.push({
      id: `unpub-${app.appId}-${app.unpublishedAt}`,
      ts: app.unpublishedAt,
      kind: "unpublished",
      title: "App unpublished",
      summary: "No longer listed on Google Play — kept on App Tracking",
      appId: app.appId,
      appTitle: app.title,
      icon: app.icon,
      from: "live",
      to: "unpublished",
    });
  }

  for (let i = 1; i < snaps.length; i++) {
    events.push(...eventsFromSnapshotPair(app, snaps[i - 1], snaps[i]));
  }

  events.push(...eventsFromNotifications(app, notifications));

  // Dedupe near-identical events (same kind + app within 2 minutes) preferring richer data.
  const sorted = events.sort((a, b) => b.ts - a.ts);
  const seen = new Set<string>();
  const deduped: TimelineEvent[] = [];
  for (const event of sorted) {
    const bucket = Math.floor(event.ts / (2 * 60 * 1000));
    const mediaKey = event.mediaKind || "";
    const key = `${event.kind}|${event.appId}|${bucket}|${mediaKey}|${event.from ?? ""}|${event.to ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }
  return deduped;
}
