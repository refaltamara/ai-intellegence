/** The teams a person can act as: one per workspace they can reach (owners reach every workspace, members their own). */
import type { SessionPayload } from "../auth/session";
import { getWorkspace, listWorkspaces } from "./store";
import type { Team } from "./config";

export type TeamChoice = Team & { workspace_id: string; name: string; product_name: string; kind: string };

export async function teamsFor(session: Pick<SessionPayload, "role" | "ws">): Promise<TeamChoice[]> {
  const ids = session.role === "owner" ? (await listWorkspaces()).map((w) => w.id) : [session.ws];
  const cfgs = (await Promise.all(ids.map((id) => getWorkspace(id)))).filter((c): c is NonNullable<typeof c> => c != null);
  // the PR team (a person or brand to protect) first, then the category teams
  return cfgs
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "profile" ? -1 : 1))
    .map((c) => ({ ...c.team, workspace_id: c.id, name: c.name, product_name: c.product_name, kind: c.kind }));
}

/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}
