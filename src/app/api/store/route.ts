import { jsonError } from "@/lib/api";
import { hasDatabaseUrl } from "@/lib/db/neon";
import type { StoreData } from "@/lib/playstore/types";
import { readStore, upsertStoreData } from "@/lib/store/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const store = await readStore();
    return Response.json({
      store,
      database: hasDatabaseUrl() ? "postgres" : "json-fallback",
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to read store", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { store?: StoreData };
    if (!body.store || typeof body.store !== "object") {
      return jsonError("Provide { store: StoreData }");
    }
    const store = await upsertStoreData(body.store);
    return Response.json({ ok: true, store, database: hasDatabaseUrl() ? "postgres" : "json-fallback" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to save store", 500);
  }
}
