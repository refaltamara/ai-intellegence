/**
 * "Our Chorus" (CMS plan, The Builder): the team's own version of its role, whole. Which
 * Fair version it sits on and what Fair's next one would change, every change the
 * company made (with Fair's value beside it), everything the team made with its badge,
 * what waits for a Builder (with a try on real data for a skill), and the history with
 * undo. A Member sees the same page without the buttons that need a Builder.
 */
import { sql } from "../db/client";
import type { Actor } from "../auth/can";
import type { RoleModel } from "../roles/model";
import { fromRowSpec } from "../roles/store";
import { diffRoles } from "../roles/diff";
import { runRecipe } from "../recipes/run";
import type { RecipeSpec } from "../recipes/spec";
import { companyHistory, companyState, listSuggestions, type HistoryRow, type Suggestion } from "./changes";
import { isBuilder, listCreations, type Creation } from "./creations";
import { extSummaries, type ExtSummary } from "../extensions/store";
import { monthState, type MonthState } from "../credits/ledger";

export type Tried = { status: string; message?: string; rows: Record<string, unknown>[]; window?: { from: string; to: string } };

export type CompanyPage = {
  role: RoleModel;
  builder: boolean;
  me: string;
  fair_version: string;
  follows: string;
  next: { version: string; lines: string[]; note: string | null } | null;
  changes: Awaited<ReturnType<typeof companyState>>["changes"];
  creations: Creation[];
  waiting: (Creation & { tried?: Tried })[];
  history: HistoryRow[];
  suggestions: (Suggestion & { title: string | null })[];
  extensions: ExtSummary[];
  credits: MonthState;
};

export async function companyPage(ws: string, role: RoleModel, actor: Actor): Promise<CompanyPage> {
  const builder = isBuilder(actor, ws, role.id);
  const [st, history, all, suggestions, extensions, credits] = await Promise.all([
    companyState(ws, role.id),
    companyHistory(ws, role.id),
    listCreations(ws, { role: role.id }),
    listSuggestions({ ws }).then((xs) => xs.filter((s) => s.role === role.id)),
    extSummaries(ws),
    monthState(ws),
  ]);
  // a Member sees the team's live and removed creations and their own; a Builder sees all
  const creations = builder ? all : all.filter((c) => c.maker_email === actor.email || c.status === "approved");
  const waiting = builder ? all.filter((c) => c.status === "waiting") : [];
  // the approver sees a skill on the team's own data before saying yes
  const tried = await Promise.all(waiting.map(async (c) => {
    if (c.kind !== "skill") return c;
    const r = await runRecipe(c.spec as unknown as RecipeSpec, {}, ws).catch((e) => ({ status: "error", message: (e as Error).message, rows: [] as Record<string, unknown>[] }));
    return { ...c, tried: { status: r.status, message: r.message, rows: r.rows.slice(0, 8), window: "window" in r ? r.window : undefined } };
  }));
  // what Fair's next version would change: a proposal, or a release staged elsewhere first
  const nextRows = (await sql.query(
    "select version, spec, release_note from role_versions where role = $1 and (status = 'proposed' or (status = 'released' and stage_workspaces is not null and not ($2::text = any(stage_workspaces)))) order by created_at desc limit 1",
    [role.id, ws],
  )) as { version: string; spec: unknown; release_note: string | null }[];
  const next = nextRows[0] && nextRows[0].version !== st.fair.version ? { version: nextRows[0].version, lines: diffRoles(st.fair, fromRowSpec(role.id, nextRows[0].spec, nextRows[0].version)), note: nextRows[0].release_note } : null;
  return { role, builder, me: actor.email, fair_version: st.fair.version, follows: st.follows, next, changes: st.changes, creations, waiting: tried, history, suggestions, extensions, credits };
}
