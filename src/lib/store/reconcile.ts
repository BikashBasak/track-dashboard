import type { StoreData } from "@/lib/playstore/types";

/** Removed items belong only on Remove App / Remove Account, never on tracking lists. */
export function reconcileStore(data: StoreData): StoreData {
  const removedAppIds = new Set(data.removedApps.map((app) => app.appId));
  const removedAccountIds = new Set(data.removedAccounts.map((acc) => acc.developerId));
  return {
    ...data,
    apps: data.apps.filter((app) => !removedAppIds.has(app.appId)),
    accounts: data.accounts.filter((acc) => !removedAccountIds.has(acc.developerId)),
  };
}
