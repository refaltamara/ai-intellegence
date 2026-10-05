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
// The connector is exempt from the cookie's workspace on purpose: a token carries its own
// workspace (the team chosen on the consent screen), checked below. The CMS routes act on Fair's
// roles and staff, not on a workspace's data, and are staff only (can()); accepting an invitation
// uses the invitation's own workspace.
const EXEMPT = ["api/auth/", "api/cron/", "api/diag/", "api/health/", "api/workspace/switch/", "api/oauth/", "api/mcp/", "api/admin/", "api/invites/accept/"];

describe("API routes scope by the current workspace", () => {
  for (const file of routes(path.join(process.cwd(), "app/api"))) {
    const rel = path.relative(process.cwd(), file);
    if (EXEMPT.some((e) => rel.includes(e))) continue;
    it(rel, () => {
      expect(readFileSync(file, "utf8")).toMatch(/currentWorkspaceId\(\)/);
    });
  }
});

describe("the connector scopes by its token, never by the browser cookie", () => {
  it("app/api/mcp/route.ts", () => {
    const src = readFileSync(path.join(process.cwd(), "app/api/mcp/route.ts"), "utf8");
    expect(src).toMatch(/grant\.workspace_id/);
    expect(src).not.toMatch(/currentWorkspaceId\(\)/);
  });
  it("app/api/oauth/authorize/route.ts only issues codes for a team the person can reach", () => {
    expect(readFileSync(path.join(process.cwd(), "app/api/oauth/authorize/route.ts"), "utf8")).toMatch(/teamsFor\(await currentActor\(\)\)/);
  });
});
