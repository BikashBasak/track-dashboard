import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatFullNumber(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en").format(value);
}

export function formatScore(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

export function isPackageId(query: string) {
  return /^[a-zA-Z][\w]*(\.[\w]+)+$/.test(query.trim());
}

export function isNumericDeveloperId(query: string) {
  return /^\d{6,}$/.test(query.trim());
}

/** Accept a Play developer URL or a raw name / numeric id. */
export function extractDeveloperQuery(raw: string) {
  const value = raw.trim();
  try {
    const url = new URL(value);
    if (url.hostname.includes("play.google.com")) {
      const id = url.searchParams.get("id");
      if (id) return decodeURIComponent(id.replace(/\+/g, " "));
    }
  } catch {
    // not a URL
  }
  return value.replace(/\+/g, " ");
}

export function encodeAppId(appId: string) {
  return encodeURIComponent(appId);
}

export function playUrl(appId: string, country = "us") {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&gl=${country}`;
}

/** Normalize Play CDN / protocol-relative media URLs for browser loading. */
export function normalizeMediaUrl(url?: string | null): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  return raw;
}

export function developerPlayUrl(developerId: string) {
  const id = extractDeveloperQuery(developerId);
  if (isNumericDeveloperId(id)) {
    return `https://play.google.com/store/apps/dev?id=${id}`;
  }
  return `https://play.google.com/store/apps/developer?id=${encodeURIComponent(id).replace(/%20/g, "+")}`;
}
