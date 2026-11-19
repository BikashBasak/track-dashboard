import { NOTIFICATION_KINDS, type NotificationDraft, type NotificationItem, type NotificationKind, type NotificationPrefs, type NotificationState } from "@/lib/notifications/types";
import { SCREENSHOT_PREVIEW_CAP } from "@/lib/store/snapshots";

const ITEMS_KEY = "track-dashboard-notifications-v1";
const PREFS_KEY = "track-dashboard-notification-prefs-v1";
const EVENT = "track-notifications";
const MAX_ITEMS = 200;
const DEDUPE_MS = 24 * 60 * 60 * 1000;
const KIND_SET = new Set<string>(NOTIFICATION_KINDS);

export function defaultPrefs(): NotificationPrefs {
  return {
    enabled: {
      "account-name": true,
      "app-name": true,
      "app-category": true,
      "app-removed": true,
      "app-republished": true,
      "account-removed": true,
      "app-update": true,
      "account-new-app": true,
      "app-description": true,
      "app-screenshots": true,
    },
  };
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function isKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && KIND_SET.has(value);
}

function coerceCreatedAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sanitizeItem(raw: unknown): NotificationItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<NotificationItem>;
  if (!isKind(item.kind)) return null;
  const createdAt = coerceCreatedAt(item.createdAt);
  if (createdAt == null) return null;
  if (typeof item.id !== "string" || !item.id) return null;
  if (typeof item.title !== "string" || typeof item.body !== "string") return null;
  if (typeof item.href !== "string" || typeof item.entityId !== "string") return null;
  if (typeof item.fingerprint !== "string") return null;
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    href: item.href,
    entityId: item.entityId,
    entityLabel: typeof item.entityLabel === "string" ? item.entityLabel : item.title,
    icon: item.icon ?? null,
    publisherId: typeof item.publisherId === "string" && item.publisherId ? item.publisherId : null,
    from: item.from ?? null,
    to: item.to ?? null,
    added: typeof item.added === "string" && item.added ? item.added : null,
    mediaBefore: Array.isArray(item.mediaBefore)
      ? item.mediaBefore.map(String).filter(Boolean).slice(0, SCREENSHOT_PREVIEW_CAP)
      : null,
    mediaAfter: Array.isArray(item.mediaAfter)
      ? item.mediaAfter.map(String).filter(Boolean).slice(0, SCREENSHOT_PREVIEW_CAP)
      : null,
    mediaKind:
      item.mediaKind === "screenshots" ||
      item.mediaKind === "icon" ||
      item.mediaKind === "banner" ||
      item.mediaKind === "video"
        ? item.mediaKind
        : null,
    relatedAppId: typeof item.relatedAppId === "string" ? item.relatedAppId : undefined,
    fingerprint: item.fingerprint,
    read: Boolean(item.read),
    createdAt,
  };
}

function readPrefs(): NotificationPrefs {
  const parsed = readJson<Partial<NotificationPrefs>>(PREFS_KEY);
  const base = defaultPrefs();
  if (!parsed?.enabled) return base;
  for (const kind of NOTIFICATION_KINDS) {
    if (typeof parsed.enabled[kind] === "boolean") base.enabled[kind] = parsed.enabled[kind];
  }
  return base;
}

function readItems(): NotificationItem[] {
  const parsed = readJson<NotificationItem[] | { items: NotificationItem[] }>(ITEMS_KEY);
  const raw = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.items) ? parsed.items : [];
  const items = raw.map(sanitizeItem).filter((item): item is NotificationItem => Boolean(item));
  if (items.length !== raw.length) {
    // Drop corrupt rows so the next page load stays healthy.
    safeSetItem(ITEMS_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  }
  return items;
}

function writeItems(items: NotificationItem[]) {
  safeSetItem(ITEMS_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  emit();
}

function writePrefs(prefs: NotificationPrefs) {
  safeSetItem(PREFS_KEY, JSON.stringify(prefs));
  emit();
}

export function readNotificationState(): NotificationState {
  if (typeof window === "undefined") return { items: [], prefs: defaultPrefs() };
  return { items: readItems(), prefs: readPrefs() };
}

export function pushNotifications(drafts: NotificationDraft[]) {
  if (typeof window === "undefined" || drafts.length === 0) return 0;
  const prefs = readPrefs();
  const allowed = drafts.filter((d) => prefs.enabled[d.kind]);
  if (allowed.length === 0) return 0;

  const existing = readItems();
  const now = Date.now();
  const recent = new Set(
    existing.filter((item) => now - item.createdAt < DEDUPE_MS).map((item) => item.fingerprint),
  );

  const next: NotificationItem[] = [];
  for (const draft of allowed) {
    if (recent.has(draft.fingerprint)) continue;
    recent.add(draft.fingerprint);
    next.push({
      ...draft,
      id: crypto.randomUUID(),
      read: false,
      createdAt: now,
    });
  }
  if (next.length === 0) return 0;
  writeItems([...next, ...existing].slice(0, MAX_ITEMS));
  return next.length;
}

export function markNotificationRead(id: string, read = true) {
  writeItems(readItems().map((item) => (item.id === id ? { ...item, read } : item)));
}

export function markAllNotificationsRead() {
  writeItems(readItems().map((item) => ({ ...item, read: true })));
}

export function removeNotification(id: string) {
  writeItems(readItems().filter((item) => item.id !== id));
}

export function clearNotifications() {
  writeItems([]);
}

export function setNotificationKindEnabled(kind: NotificationDraft["kind"], enabled: boolean) {
  const prefs = readPrefs();
  prefs.enabled[kind] = enabled;
  writePrefs(prefs);
}

export function unreadCount(items: NotificationItem[] = readItems()) {
  return items.filter((item) => !item.read).length;
}

export const NOTIFICATIONS_EVENT = EVENT;
