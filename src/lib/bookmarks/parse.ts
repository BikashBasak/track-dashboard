export type BookmarkKind = "app" | "account";

export type PlayBookmark = {
  href: string;
  title: string;
  folder: string;
  path: string[];
  kind: BookmarkKind;
  id: string;
};

const ROOT_FOLDERS = new Set([
  "bookmarks",
  "bookmarks bar",
  "bookmarks toolbar",
  "other bookmarks",
  "bookmarks menu",
  "mobile bookmarks",
  "imported",
]);

function decodeEntities(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/\s+/g, " ")
    .trim();
}

function categoryFromPath(path: string[]) {
  const names = path.filter((name) => !ROOT_FOLDERS.has(name.toLowerCase()));
  return names.at(-1) || "Imported";
}

export function classifyPlayUrl(href: string): { kind: BookmarkKind; id: string } | null {
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  if (!url.hostname.includes("play.google.com")) return null;
  const path = url.pathname.toLowerCase();
  if (path.includes("/console")) return null;
  const rawId = url.searchParams.get("id");
  if (!rawId) return null;
  const id = decodeURIComponent(rawId.replace(/\+/g, " ")).trim();
  if (!id) return null;
  if (path.includes("/apps/details")) return { kind: "app", id };
  if (/\/apps\/developer(?:\/|$)/.test(path) || /\/apps\/dev(?:\/|$)/.test(path)) {
    return { kind: "account", id };
  }
  return null;
}

export function parsePlayBookmarks(html: string): {
  accounts: PlayBookmark[];
  apps: PlayBookmark[];
  skipped: number;
} {
  const folderStack: string[] = [];
  const accounts: PlayBookmark[] = [];
  const apps: PlayBookmark[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  const token =
    /<DT>\s*<H3\b[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A\b[^>]*HREF="([^"]+)"[^>]*>([\s\S]*?)<\/A>|<\/DL>/gi;

  for (const match of html.matchAll(token)) {
    if (/^<\/DL/i.test(match[0])) {
      folderStack.pop();
      continue;
    }
    if (match[1] != null) {
      const name = decodeEntities(match[1]);
      if (name) folderStack.push(name);
      continue;
    }
    const href = match[2];
    if (!href) continue;
    const classified = classifyPlayUrl(href);
    if (!classified) {
      skipped += 1;
      continue;
    }
    const key = `${classified.kind}:${classified.id.toLowerCase()}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const path = [...folderStack];
    const item: PlayBookmark = {
      href,
      title: decodeEntities(match[3] || classified.id),
      folder: categoryFromPath(path),
      path,
      kind: classified.kind,
      id: classified.id,
    };
    if (classified.kind === "account") accounts.push(item);
    else apps.push(item);
  }

  return { accounts, apps, skipped };
}
