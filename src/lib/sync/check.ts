import { presenceOf, type PlayPresence, type PresenceRow } from "@/lib/playstore/presence";
import type { AppDetails } from "@/lib/playstore/types";

type CheckResponse = {
  apps?: Array<PresenceRow & { app?: AppDetails }>;
  accounts?: PresenceRow[];
  error?: string;
};

export type PresenceCheckResult = {
  apps: Array<PresenceRow & { app?: AppDetails }>;
  accounts: PresenceRow[];
};

export async function checkPlayPresence(
  qs: string,
  input: { appIds?: string[]; developerIds?: string[] },
): Promise<PresenceCheckResult> {
  const res = await fetch(`/api/removed/check?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appIds: input.appIds ?? [],
      developerIds: input.developerIds ?? [],
    }),
  });
  const data = (await res.json()) as CheckResponse;
  if (!res.ok) {
    throw new Error(data.error || "Play check failed");
  }
  return {
    apps: (data.apps || []).map((row) => {
      const status = presenceOf(row);
      return { ...row, status, live: status === "live" };
    }),
    accounts: (data.accounts || []).map((row) => {
      const status = presenceOf(row);
      return { ...row, status, live: status === "live" };
    }),
  };
}

export function goneIds(rows: Array<{ id: string; status?: PlayPresence; live?: boolean }>) {
  return rows.filter((row) => presenceOf(row) === "gone").map((row) => row.id);
}

export function liveIds(rows: Array<{ id: string; status?: PlayPresence; live?: boolean }>) {
  return rows.filter((row) => presenceOf(row) === "live").map((row) => row.id);
}
