import { defineConfig } from "drizzle-kit";

// Migrations are generated offline (`pnpm db:generate`) and applied by
// scripts/migrate.ts over Neon's HTTP driver, so no DB credentials are needed here.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  strict: true,
  verbose: true,
});
