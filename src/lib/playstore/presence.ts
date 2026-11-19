export type PlayPresence = "live" | "gone" | "uncertain";

export type PresenceRow = {
  id: string;
  status: PlayPresence;
  live: boolean;
  title?: string;
  name?: string;
  error?: string;
  /** Country where the listing was found when primary storefront returned 404. */
  foundIn?: string;
};

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : undefined;
}

/** Only treat a real Play 404 as gone. Timeouts, 429s, and parse errors stay uncertain. */
export function classifyPlayError(error: unknown): Exclude<PlayPresence, "live"> {
  const code = statusCode(error);
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (code === 404 || message.includes("app not found (404)") || message.includes("not found (404)")) {
    return "gone";
  }
  return "uncertain";
}

export function presenceOf(row: { status?: string; live?: boolean } | null | undefined): PlayPresence {
  if (row?.status === "live" || row?.status === "gone" || row?.status === "uncertain") return row.status;
  if (row?.live === true) return "live";
  return "uncertain";
}
