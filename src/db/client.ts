import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/** Pooled URL as configured; the unpooled one is derived by removing "-pooler" (DECISIONS). */
export function databaseUrl(kind: "pooled" | "unpooled" = "pooled"): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return kind === "unpooled" ? url.replace("-pooler.", ".") : url;
}

// Neon's HTTP driver talks SQL over HTTPS, which also works from sandboxes that block 5432.
neonConfig.poolQueryViaFetch = true;

export const sql = neon(databaseUrl("pooled"));
export const db = drizzle({ client: sql, schema });
export type Db = typeof db;
