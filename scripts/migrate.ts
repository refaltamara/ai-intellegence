/**
 * Applies Drizzle migrations over Neon's HTTP driver, then (re)creates the
 * materialized views from src/db/views.sql. Usage: pnpm db:migrate
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { databaseUrl } from "../src/db/client";

function statements(sqlText: string): string[] {
  return sqlText
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const client = neon(databaseUrl("unpooled"));
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  console.log("migrations: up to date");
  for (const stmt of statements(readFileSync("src/db/views.sql", "utf8"))) {
    await client.query(stmt);
  }
  console.log("materialized views: created");
  const mvs = (await client.query(
    "select matviewname from pg_matviews where schemaname = 'public' order by 1",
  )) as Array<{ matviewname: string }>;
  console.log("  " + mvs.map((r) => r.matviewname).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
