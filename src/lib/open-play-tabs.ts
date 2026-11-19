import { playUrl } from "@/lib/utils";

export type OpenTabsResult = {
  opened: number;
  requested: number;
  blocked: boolean;
  empty: boolean;
};

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

/**
 * Open every URL in its own tab during this click.
 * Chrome and Edge allow every tab only after popups are allowed for the site.
 */
export function openUrls(urls: string[], label: "app" | "account"): OpenTabsResult {
  const unique = uniqueValues(urls);
  if (unique.length === 0) return { opened: 0, requested: 0, blocked: false, empty: true };

  let opened = 0;
  for (const url of unique) {
    let tab: Window | null = null;
    try {
      tab = window.open(url, "_blank");
    } catch {
      tab = null;
    }
    if (!tab) continue;
    opened += 1;
    try {
      tab.opener = null;
    } catch {
      /* already cross-origin */
    }
  }

  const blocked = opened < unique.length;
  if (blocked) {
    const missed = unique.length - opened;
    const noun = label === "account" ? "account" : "app";
    const nouns = `${noun}s`;
    window.alert(
      opened === 0
        ? `The browser blocked all ${unique.length} Play Store tabs.\n\nAllow popups, then click Open all on Play again.\n\nChrome or Edge: click the popup icon at the right of the address bar and choose Always allow popups and redirects from this site.`
        : `Only ${opened} of ${unique.length} ${nouns} opened. The browser blocked the other ${missed}.\n\nTo open every ${noun} in this category:\n1. Click the popup-blocked icon at the right of the address bar.\n2. Choose Always allow popups and redirects from this site.\n3. Click Open all on Play again.`,
    );
  }

  return { opened, requested: unique.length, blocked, empty: false };
}

export function openPlayListings(appIds: string[], country: string): OpenTabsResult {
  return openUrls(
    uniqueValues(appIds).map((id) => playUrl(id, country)),
    "app",
  );
}

export function openTabsMessage(result: OpenTabsResult, extra?: string) {
  const parts: string[] = [];
  if (result.empty) parts.push("Nothing to open.");
  else if (result.blocked && result.opened === 0) {
    parts.push("The browser blocked the Play Store tabs. Allow popups for this site, then click Open all on Play again.");
  } else if (result.blocked) {
    parts.push(
      `Opened ${result.opened} of ${result.requested}. Allow popups for this site (address-bar popup icon → Always allow), then click Open all on Play again.`,
    );
  } else if (result.opened > 0) {
    parts.push(`Opened ${result.opened} Play Store tab${result.opened === 1 ? "" : "s"}.`);
  }
  if (extra) parts.push(extra);
  return parts.join(" ");
}
