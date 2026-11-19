import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] || "https://track-dashboard-up40.onrender.com";
const storePath = path.join(root, "data", "store.json");
const store = JSON.parse(readFileSync(storePath, "utf8"));

const res = await fetch(`${target.replace(/\/$/, "")}/api/store/migrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ store, force: false }),
});
const json = await res.json();
if (!res.ok) {
  console.error(json.error || res.statusText);
  process.exit(1);
}
const s = json.store || json;
console.log(
  JSON.stringify(
    {
      migrated: json.migrated,
      reason: json.reason,
      database: json.database,
      apps: s.apps?.length ?? 0,
      accounts: s.accounts?.length ?? 0,
      categories: s.categories?.length ?? 0,
    },
    null,
    2,
  ),
);