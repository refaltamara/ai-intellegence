/**
 * Who may do what (CMS plan, People and access). One pure function, checked on the
 * server by every page, route, CMS screen and tool. Five kinds of people: Fair's
 * owners (Refal, Rafli), role owners, data ops, and in a client workspace its Builders
 * and Members. Fair staff reach every workspace; a client reaches the workspaces it
 * has a membership in, and there the roles its levels name.
 */
import type { Duty } from "../config/staff";
import type { RoleId } from "../roles/model";

export type Level = "builder" | "member";
export const LEVELS: Level[] = ["builder", "member"];
export const isLevel = (v: unknown): v is Level => v === "builder" || v === "member";

export type Membership = { user_id: string; workspace_id: string; levels: Partial<Record<RoleId, Level>> };

export type Actor = {
  /** the membership the session signed in with (users.id); what a person makes points here */
  uid: string;
  account_id: string;
  email: string;
  name: string | null;
  staff: Duty[];
  /** the workspace of that membership */
  home: string;
  memberships: Membership[];
  /** workspaces closed to this person: a workspace whose settings.restricted_to names others only (staff included) */
  hidden?: string[];
};

export type Action =
  /** open the CMS at all */
  | "cms.open"
  /** release a role version, pin a client to one, set prices, change Fair staff duties */
  | "role.release"
  | "role.pin"
  | "staff.manage"
  /** set a workspace's credit pool and billing, add top-ups, see Fair's real cost */
  | "billing.manage"
  /** draft a role version, roll one back */
  | "role.draft"
  | "role.rollback"
  /** change design (layouts, deck and slide designs) */
  | "design.change"
  /** data settings of a workspace: client brand, caption reading, brands, relevance, topics; invite its first Builder */
  | "workspace.data"
  | "workspace.builders"
  /** open a workspace at all */
  | "workspace.reach"
  /** act as a role in a workspace */
  | "role.use"
  /** shape the company's version of a role; approve what Members make */
  | "company.change"
  /** invite and remove Members of a workspace */
  | "team.manage";

export type Ctx = { workspace?: string; role?: RoleId };

const has = (a: Actor, ...d: Duty[]) => a.staff.some((x) => d.includes(x));
export const isStaff = (a: Pick<Actor, "staff">) => a.staff.length > 0;
const member = (a: Actor, ws?: string) => (ws ? a.memberships.find((m) => m.workspace_id === ws) : undefined);

export function can(a: Actor, action: Action, ctx: Ctx = {}): boolean {
  // a restricted workspace is closed to everyone it does not name, Fair staff included
  if (ctx.workspace && a.hidden?.includes(ctx.workspace)) return false;
  const m = member(a, ctx.workspace);
  const builderAnywhere = !!m && Object.values(m.levels).includes("builder");
  switch (action) {
    case "cms.open":
      return isStaff(a);
    case "role.release":
    case "role.pin":
    case "staff.manage":
    case "billing.manage":
      return has(a, "owner");
    case "role.draft":
    case "role.rollback":
      return has(a, "owner", "role_owner");
    case "design.change":
      return has(a, "owner", "designer");
    case "workspace.data":
    case "workspace.builders":
      return has(a, "owner", "data_ops");
    case "workspace.reach":
      return isStaff(a) || !!m;
    case "role.use":
      return isStaff(a) || (!!m && !!ctx.role && !!m.levels[ctx.role]);
    case "company.change":
      return has(a, "owner", "data_ops") || (!!m && !!ctx.role && m.levels[ctx.role] === "builder");
    case "team.manage":
      return has(a, "owner", "data_ops") || builderAnywhere;
  }
}

/** the roles of a workspace this person may use, in the workspace's order */
export function rolesFor(a: Actor, ws: string, offered: RoleId[]): RoleId[] {
  return offered.filter((r) => can(a, "role.use", { workspace: ws, role: r }));
}

/** a person's level on a role, for the screen: Fair staff act as Builders everywhere */
export function levelOf(a: Actor, ws: string, role: RoleId): Level | null {
  if (isStaff(a)) return "builder";
  return member(a, ws)?.levels[role] ?? null;
}
