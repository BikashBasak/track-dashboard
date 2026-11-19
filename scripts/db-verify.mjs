import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const sql = neon(process.env.DATABASE_URL);
await sql`SELECT 1 AS ok`;
const tables = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`;
const counts = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM tracked_apps) AS apps,
    (SELECT COUNT(*)::int FROM tracked_accounts) AS accounts,
    (SELECT COUNT(*)::int FROM app_snapshots) AS app_snapshots
`;
console.log(
  JSON.stringify(
    {
      ok: true,
      tables: tables.map((t) => t.table_name),
      counts: counts[0],
    },
    null,
    2,
  ),
);
