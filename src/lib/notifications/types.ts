export const NOTIFICATION_KINDS = [
  "account-name",
  "app-name",
  "app-category",
  "app-removed",
  "app-republished",
  "account-removed",
  "app-update",
  "account-new-app",
  "app-description",
  "app-screenshots",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  entityId: string;
  entityLabel: string;
  icon?: string | null;
  /** Play publisher / developer id when known. */
  publisherId?: string | null;
  from?: string | null;
  to?: string | null;
  /** New text that appeared vs the previous description (description alerts). */
  added?: string | null;
  /** Image / video URLs before a media change (icon, banner, screenshots, video). */
  mediaBefore?: string[] | null;
  /** Image / video URLs after a media change. */
  mediaAfter?: string[] | null;
  /** How to lay out media previews. */
  mediaKind?: "screenshots" | "icon" | "banner" | "video" | null;
  relatedAppId?: string;
  fingerprint: string;
  read: boolean;
  createdAt: number;
};

export type NotificationDraft = Omit<NotificationItem, "id" | "read" | "createdAt">;

export type NotificationPrefs = {
  enabled: Record<NotificationKind, boolean>;
};

export type NotificationState = {
  items: NotificationItem[];
  prefs: NotificationPrefs;
};
