import { readdirSync, readFileSync } from "node:fs";
import { getSqlite } from "../lib/runtime";
import { authOptions } from "../lib/auth";
import { getMigrations } from "better-auth/db/migration";

const sqlite = getSqlite();
sqlite.exec(
  "CREATE TABLE IF NOT EXISTS bouwr_migrations (name TEXT PRIMARY KEY, applied TEXT NOT NULL)",
);
for (const name of readdirSync("drizzle")
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  if (sqlite.prepare("SELECT 1 FROM bouwr_migrations WHERE name=?").get(name))
    continue;
  sqlite.transaction(() => {
    sqlite.exec(readFileSync("drizzle/" + name, "utf8"));
    sqlite
      .prepare("INSERT INTO bouwr_migrations (name,applied) VALUES (?,?)")
      .run(name, new Date().toISOString());
  })();
}
const migrations = await getMigrations(authOptions());
await migrations.runMigrations();
console.log("Bouwr-database en accountschema zijn bijgewerkt.");
