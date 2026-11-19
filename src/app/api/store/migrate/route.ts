import { jsonError } from "@/lib/api";
import { hasDatabaseUrl } from "@/lib/db/neon";
import type { StoreData } from "@/lib/playstore/types";
import { isStoreEmpty, migrateFromLocal, readStore } from "@/lib/store/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function hasLocalPayload(store?: StoreData | null) {
  if (!store) return false;
  return Boolean(
    store.apps?.length ||
      store.accounts?.length ||
      store.categories?.length ||
      store.accountCategories?.length ||
      store.removedApps?.length ||
      store.removedAccounts?.length ||
      store.keywords?.length,
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { store?: StoreData; force?: boolean; mergeOnly?: boolean };
    if (!hasLocalPayload(body.store)) {
      const store = await readStore();
      return Response.json({
        migrated: false,
        reason: "empty-local",
        store,
        database: hasDatabaseUrl() ? "postgres" : "json-fallback",
      });
    }

    const result = await migrateFromLocal(body.store!, {
      force: Boolean(body.force),
      mergeOnly: Boolean(body.mergeOnly),
    });
    return Response.json({
      ...result,
      database: hasDatabaseUrl() ? "postgres" : "json-fallback",
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Migration failed", 500);
  }
}
