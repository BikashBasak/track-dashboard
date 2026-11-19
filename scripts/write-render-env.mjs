import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = readFileSync(path.join(root, ".env.local"), "utf8");
let databaseUrl = "";
for (const line of local.split(/\r?\n/)) {
  if (!line.startsWith("DATABASE_URL=")) continue;
  let v = line.slice("DATABASE_URL=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  databaseUrl = v;
  break;
}
if (!databaseUrl) throw new Error("DATABASE_URL missing in .env.local");
writeFileSync(
  path.join(root, ".env.render"),
  `NODE_ENV=production\nDATABASE_URL=${databaseUrl}\n`,
  "utf8",
);