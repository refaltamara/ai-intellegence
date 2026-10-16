import { describe, expect, it } from "vitest";
import { BRAND_KOL, MAIN_NAV, PR, ROLES, ROLE_ORDER, SOCIAL, fillRole, isRoleId, roleNav, workspaceRoles } from "../model";
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
  it("every team has the same four places, whatever the workspace or the role's stored nav (16 Oct 2026)", () => {
    expect(MAIN_NAV).toEqual(["dashboard", "decks", "chats", "cases"]);
    for (const r of [PR, BRAND_KOL, SOCIAL]) for (const kind of ["category", "profile"]) expect(roleNav(r, kind)).toEqual(MAIN_NAV);
    expect(roleNav({ ...PR, nav: ["dashboard", "pulse", "chats", "reports"] }, "profile", true)).toEqual(MAIN_NAV);
    expect(roleNav(BRAND_KOL, "category")).not.toContain("weekly");
  });
  it("the switcher shows all three roles, in one order", () => {
    expect([...ROLE_ORDER]).toEqual(["pr", "brand_kol", "social"]);
    expect(ROLE_ORDER.every((r) => r in ROLES)).toBe(true);
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
    expect(isRoleId("social")).toBe(true);
    expect(isRoleId("investor")).toBe(false);
  });
});
