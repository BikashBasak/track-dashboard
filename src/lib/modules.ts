export type ModuleStatus = "live" | "next" | "planned";

export type ProductModule = {
  id: string;
  href: string;
  title: string;
  short: string;
  description: string;
  status: ModuleStatus;
  phase: number;
  features: string[];
};

export const PRODUCT_MODULES: ProductModule[] = [
  {
    id: "app-tracking",
    href: "/apps",
    title: "App Tracking",
    short: "Live listing, ratings, installs, reviews, similar apps",
    description:
      "Look up any Google Play app by name or package ID. Store listing, ratings, installs, changelog, reviews, permissions, data safety, and similar apps.",
    status: "live",
    phase: 1,
    features: [
      "Search by name or package ID",
      "Full listing profile + screenshots",
      "Installs, ratings histogram, IAP/ads flags",
      "Reviews, permissions, data safety",
      "Similar apps and watchlist snapshots",
    ],
  },
  {
    id: "account-tracking",
    href: "/accounts",
    title: "Account Tracking",
    short: "Publisher portfolio, health, new and updated apps",
    description:
      "Track a Google Play developer account: every published app, portfolio health, newest releases, and recently updated titles.",
    status: "live",
    phase: 1,
    features: [
      "Search by publisher name or ID",
      "Full catalog of published apps",
      "Custom publisher categories",
      "Average rating and install footprint",
      "Watchlist snapshots over time",
    ],
  },
  {
    id: "notifications",
    href: "/notifications",
    title: "Notifications",
    short: "Inbox for listing changes on tracked apps and accounts",
    description:
      "Alerts when a tracked app or publisher changes name, Play category, version, description, screenshots, disappears from Play, comes back, or ships a new app. Click to open, mark read, or remove.",
    status: "live",
    phase: 2,
    features: [
      "Header bell + unread badge",
      "Name, category, update, description, screenshots, takedown, republish, new app",
      "Click to open the app or account",
      "Remove, mark read, enable/disable types",
    ],
  },
  {
    id: "settings",
    href: "/settings",
    title: "Settings",
    short: "Sync, storefront, and sign-out",
    description: "Auto-sync, full sync, and dashboard preferences.",
    status: "live",
    phase: 1,
    features: ["Auto sync", "Full sync", "Storefront"],
  },
];

export function liveModules() {
  return PRODUCT_MODULES.filter((m) => m.status === "live");
}
