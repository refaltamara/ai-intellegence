import { describe, expect, it } from "vitest";
import { BRAND_KOL, PR, ROLES, fillRole, isRoleId, roleNav, workspaceRoles } from "../model";
import { teamFor } from "../../workspace/config";

describe("role models", () => {
  it("every role offers the same three features: Dashboard, Decks, Chats", () => {
    for (const r of Object.values(ROLES)) for (const k of ["dashboard", "decks", "chats"] as const) expect(r.nav).toContain(k);
  });
  it("a workspace offers the roles in its settings, else one by kind", () => {
    expect(workspaceRoles("category", ["pr", "brand_kol"])).toEqual(["pr", "brand_kol"]);
    expect(workspaceRoles("category", ["pr", "nope", "pr"])).toEqual(["pr"]);
    expect(workspaceRoles("category", undefined)).toEqual(["brand_kol"]);
    expect(workspaceRoles("profile", [])).toEqual(["pr"]);
  });
  it("a one-person profile keeps its crisis view and boards", () => {
    expect(roleNav(PR, "profile")).toEqual(["dashboard", "pulse", "chats", "reports"]);
    expect(roleNav(PR, "category")).toEqual(PR.nav);
    expect(roleNav(BRAND_KOL, "category")).toContain("weekly");
  });
  it("team cards come from the role, with the profile's own words for PR", () => {
    expect(teamFor({ kind: "category" }, PR).label).toBe("PR team");
    expect(teamFor({ kind: "profile" }, PR).description).toMatch(/person or brand you protect/);
    expect(teamFor({ kind: "category", team_override: { label: "Comms" } }, PR).label).toBe("Comms");
  });
  it("PR's words name the client and never a number", () => {
    expect(fillRole(PR.voice, "GoPay")).toContain("GoPay's PR team");
    expect(PR.voice).not.toMatch(/\d{2,}/);
    expect(isRoleId("pr")).toBe(true);
    expect(isRoleId("social")).toBe(false);
  });
});
