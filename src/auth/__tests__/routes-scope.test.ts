import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
  });
}

// Routes that touch workspace data must scope by the session's (or the owner's switched) workspace.
// The chat route once forgot, and every question asked from the Maudy workspace was answered from the beauty panel.
const EXEMPT = ["api/auth/", "api/cron/", "api/diag/", "api/health/", "api/workspace/switch/"];

describe("API routes scope by the current workspace", () => {
  for (const file of routes(path.join(process.cwd(), "app/api"))) {
    const rel = path.relative(process.cwd(), file);
    if (EXEMPT.some((e) => rel.includes(e))) continue;
    it(rel, () => {
      expect(readFileSync(file, "utf8")).toMatch(/currentWorkspaceId\(\)/);
    });
  }
});
