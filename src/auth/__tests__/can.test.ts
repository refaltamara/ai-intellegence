import { describe, expect, it } from "vitest";
import { can, levelOf, rolesFor, type Actor } from "../can";

const base = { uid: "u", account_id: "a", email: "x@y.z", name: null, home: "beauty-id" };
const owner: Actor = { ...base, staff: ["owner"], memberships: [{ user_id: "u", workspace_id: "beauty-id", levels: { brand_kol: "builder" } }] };
const roleOwner: Actor = { ...base, staff: ["role_owner", "designer"], memberships: [] };
const dataOps: Actor = { ...base, staff: ["data_ops"], memberships: [] };
const builder: Actor = { ...base, staff: [], home: "fintech-id", memberships: [{ user_id: "b", workspace_id: "fintech-id", levels: { pr: "builder", social: "member" } }] };
const memberA: Actor = { ...base, staff: [], home: "fintech-id", memberships: [{ user_id: "m", workspace_id: "fintech-id", levels: { pr: "member" } }] };

describe("can", () => {
  it("only Fair staff open the CMS", () => {
    expect([owner, roleOwner, dataOps].every((a) => can(a, "cms.open"))).toBe(true);
    expect(can(builder, "cms.open")).toBe(false);
    expect(can(memberA, "cms.open")).toBe(false);
  });

  it("only owners release, pin and manage staff; role owners draft and roll back", () => {
    expect(can(owner, "role.release")).toBe(true);
    expect(can(roleOwner, "role.release")).toBe(false);
    expect(can(dataOps, "role.release")).toBe(false);
    expect(can(roleOwner, "role.rollback")).toBe(true);
    expect(can(roleOwner, "role.draft")).toBe(true);
    expect(can(dataOps, "role.rollback")).toBe(false);
    expect(can(roleOwner, "staff.manage")).toBe(false);
    expect(can(roleOwner, "design.change")).toBe(true);
    expect(can(dataOps, "design.change")).toBe(false);
  });

  it("data settings and Builders are for owners and data ops", () => {
    expect(can(dataOps, "workspace.data", { workspace: "fintech-id" })).toBe(true);
    expect(can(roleOwner, "workspace.data", { workspace: "fintech-id" })).toBe(false);
    expect(can(builder, "workspace.data", { workspace: "fintech-id" })).toBe(false);
    expect(can(builder, "workspace.builders", { workspace: "fintech-id" })).toBe(false);
  });

  it("a client reaches its own workspaces and the roles its levels name", () => {
    expect(can(builder, "workspace.reach", { workspace: "fintech-id" })).toBe(true);
    expect(can(builder, "workspace.reach", { workspace: "beauty-id" })).toBe(false);
    expect(rolesFor(builder, "fintech-id", ["pr", "brand_kol", "social"])).toEqual(["pr", "social"]);
    expect(rolesFor(memberA, "fintech-id", ["pr", "brand_kol", "social"])).toEqual(["pr"]);
    expect(rolesFor(dataOps, "fintech-id", ["pr", "brand_kol", "social"])).toEqual(["pr", "brand_kol", "social"]);
  });

  it("a Builder shapes the company version of its own roles and manages its team; a Member does neither", () => {
    expect(can(builder, "company.change", { workspace: "fintech-id", role: "pr" })).toBe(true);
    expect(can(builder, "company.change", { workspace: "fintech-id", role: "social" })).toBe(false);
    expect(can(builder, "team.manage", { workspace: "fintech-id" })).toBe(true);
    expect(can(builder, "team.manage", { workspace: "beauty-id" })).toBe(false);
    expect(can(memberA, "team.manage", { workspace: "fintech-id" })).toBe(false);
    expect(can(memberA, "company.change", { workspace: "fintech-id", role: "pr" })).toBe(false);
  });

  it("Fair staff act as Builders everywhere", () => {
    expect(levelOf(dataOps, "fintech-id", "pr")).toBe("builder");
    expect(levelOf(builder, "fintech-id", "social")).toBe("member");
    expect(levelOf(builder, "fintech-id", "brand_kol")).toBeNull();
  });
});

describe("a workspace restricted to named people", () => {
  it("is closed to everyone it does not name, Fair staff included", () => {
    const rafli = { uid: "u", account_id: "a", email: "rafli@fair-indonesia.com", name: null, staff: ["owner"], home: "beauty-id", memberships: [], hidden: ["kahf-threads"] } as never;
    expect(can(rafli, "workspace.reach", { workspace: "kahf-threads" })).toBe(false);
    expect(can(rafli, "workspace.data", { workspace: "kahf-threads" })).toBe(false);
    expect(can(rafli, "workspace.reach", { workspace: "beauty-id" })).toBe(true);
    expect(can(rafli, "role.release")).toBe(true);
  });
});

describe("a case and its access list (DECISIONS, 10 Oct 2026, step 5)", () => {
  const list = { access: ["refal@fair-indonesia.com", "raissa@example.com"] };
  const as = (email: string, staff: string[]) => ({ uid: "u", account_id: "a", email, name: null, staff, home: "beauty-id", memberships: [] }) as never as Actor;
  it("is seen only by the people on its list, Fair staff included", () => {
    expect(can(as("Refal@fair-indonesia.com", ["owner"]), "case.view", { workspace: "beauty-id", case: list })).toBe(true);
    expect(can(as("raissa@example.com", []), "case.view", { workspace: "beauty-id", case: list })).toBe(true);
    expect(can(as("rafli@fair-indonesia.com", ["owner"]), "case.view", { workspace: "beauty-id", case: list })).toBe(false);
    expect(can(as("raissa@example.com", []), "case.view", { workspace: "beauty-id" })).toBe(false);
  });
  it("is set up by Fair's owners and data ops, and changed only by those on its list", () => {
    expect(can(as("laily@fair-indonesia.com", ["data_ops"]), "case.manage", { workspace: "beauty-id" })).toBe(true);
    expect(can(as("laily@fair-indonesia.com", ["data_ops"]), "case.manage", { workspace: "beauty-id", case: list })).toBe(false);
    expect(can(as("refal@fair-indonesia.com", ["owner"]), "case.manage", { workspace: "beauty-id", case: list })).toBe(true);
    expect(can(as("raissa@example.com", []), "case.manage", { workspace: "beauty-id", case: list })).toBe(false);
    expect(can(as("audia@fair-indonesia.com", ["role_owner"]), "case.manage", { workspace: "beauty-id" })).toBe(false);
  });
  it("stays closed inside a workspace closed to the person", () => {
    const rafli = { ...as("rafli@fair-indonesia.com", ["owner"]), hidden: ["kahf-threads"] };
    expect(can(rafli, "case.view", { workspace: "kahf-threads", case: { access: ["rafli@fair-indonesia.com"] } })).toBe(false);
  });
});
