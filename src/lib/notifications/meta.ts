import type { NotificationKind } from "@/lib/notifications/types";

export type KindMeta = { label: string; short: string; description: string };

const FALLBACK_META: KindMeta = {
  label: "Alert",
  short: "Alert",
  description: "Listing alert",
};

export const KIND_META: Record<NotificationKind, KindMeta> = {
  "account-name": {
    label: "Account name change",
    short: "Account name",
    description: "Publisher display name changed on Google Play.",
  },
  "app-name": {
    label: "App name change",
    short: "App name",
    description: "Tracked app title changed on the Play listing.",
  },
  "app-category": {
    label: "Category change",
    short: "Category",
    description: "Play Store genre / category on a tracked listing changed.",
  },
  "app-removed": {
    label: "App unpublished / removed",
    short: "Unpublished",
    description: "Play listing went unpublished (stays on App Tracking), or the app was manually untracked.",
  },
  "app-republished": {
    label: "App republished",
    short: "Republished",
    description: "An unpublished app is listed on Google Play again after an app or account scan.",
  },
  "account-removed": {
    label: "Account removed",
    short: "Account gone",
    description: "A tracked publisher was untracked, or is no longer listed on Google Play.",
  },
  "app-update": {
    label: "App update",
    short: "Update",
    description: "Tracked app shipped a new version or listing update.",
  },
  "account-new-app": {
    label: "New app in account",
    short: "New app",
    description: "A tracked publisher published an app that was not in the last catalog.",
  },
  "app-description": {
    label: "Description change",
    short: "Description",
    description: "Play Store short/full description text on a listing changed.",
  },
  "app-screenshots": {
    label: "Media change",
    short: "Media",
    description: "Icon, banner, screenshots, or promo video on a Play listing changed.",
  },
};

export function kindMeta(kind: string | null | undefined): KindMeta {
  if (kind && kind in KIND_META) return KIND_META[kind as NotificationKind];
  return FALLBACK_META;
}
