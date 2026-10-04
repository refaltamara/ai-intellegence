/**
 * The teams a person can act as: one per role on each workspace they can reach (Fair
 * staff reach every workspace and role; a client the workspaces it belongs to, and there
 * the roles its levels name; src/auth/can.ts). A workspace is the data; the role is how
 * the product behaves on it (src/roles/model.ts).
 */
import { isStaff, rolesFor, type Actor } from "../auth/can";
import { roleNav, type NavKey, type RoleId } from "../roles/model";
import { getRole } from "../roles/store";
import { getWorkspace, listWorkspaces } from "./store";
import { teamFor, type Team } from "./config";

export type TeamChoice = Team & { key: string; role: RoleId; nav: NavKey[]; workspace_id: string; name: string; product_name: string; kind: string; codename: string; version: string };

export async function teamsFor(actor: Actor | null): Promise<TeamChoice[]> {
  if (!actor) return [];
  const ids = isStaff(actor) ? (await listWorkspaces()).map((w) => w.id) : actor.memberships.map((m) => m.workspace_id);
  const cfgs = (await Promise.all(ids.map((id) => getWorkspace(id)))).filter((c): c is NonNullable<typeof c> => c != null);
  // PR teams first, then the others; within a role, workspaces in their own order
  const pairs = cfgs.flatMap((c) => rolesFor(actor, c.id, c.roles).map((r) => ({ c, r }))).sort((a, b) => (a.r === b.r ? 0 : a.r === "pr" ? -1 : b.r === "pr" ? 1 : 0));
  // each team runs its company's version of the role (src/roles/store.ts): its sidebar may be narrowed
  return Promise.all(pairs.map(async ({ c, r }) => {
    const role = await getRole(c.id, r);
    return { ...teamFor(c, role), key: `${c.id}:${r}`, role: r, nav: roleNav(role, c.kind), workspace_id: c.id, name: c.name, product_name: c.product_name, kind: c.kind, codename: role.codename, version: role.version };
  }));
}

/** One entry per workspace, for choices about data (which workspace a connector reads), not about how to act. */
export function workspacesOf(teams: TeamChoice[]): TeamChoice[] {
  const seen = new Set<string>();
  return teams.filter((t) => (seen.has(t.workspace_id) ? false : (seen.add(t.workspace_id), true)));
}

/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}
