import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import path from "path";

let sql: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add a Neon Postgres connection string.");
  }
  if (!sql) sql = neon(url);
  return sql;
}

export async function ensureSchema(): Promise<void> {
  if (!hasDatabaseUrl()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getSql();
      const schemaPath = path.join(process.cwd(), "src", "lib", "db", "schema.sql");
      const raw = readFileSync(schemaPath, "utf8");
      // neon serverless runs one statement per call; split on semicolons safely enough for our file.
      const statements = raw
        .split(/;\s*\n/)
        .map((s) => s.replace(/--[^\n]*/g, "").trim())
        .filter((s) => s.length > 0);
      for (const statement of statements) {
        const text = statement.endsWith(";") ? statement : `${statement};`;
        await db.query(text, []);
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export async function getMeta(key: string): Promise<string | null> {
  await ensureSchema();
  const db = getSql();
  const rows = await db`SELECT value FROM store_meta WHERE key = ${key} LIMIT 1`;
  return rows[0]?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await ensureSchema();
  const db = getSql();
  const now = Date.now();
  await db`
    INSERT INTO store_meta (key, value, updated_at)
    VALUES (${key}, ${value}, ${now})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  `;
}
