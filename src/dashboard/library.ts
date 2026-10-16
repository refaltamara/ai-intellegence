/**
 * The Dashboard template library (Refal, 16 Oct 2026): every Dashboard a Builder saves becomes a template the
 * client's other teams on the workspace can browse and use, beside Fair's default for each role (the Dashboard
 * the role starts with). A template holds the sections' order, what is hidden or renamed, and the team's panels,
 * never data: the brands, period and platform come from the Dashboard's filters of whoever uses it. Using one
 * changes the team's Dashboard for everyone (a Builder only); a panel the team had that the template does not
 * carry is hidden, never deleted. The library's reach is one workspace for now: what a "subscription" spans is
 * still to be decided.
 */
import { sql } from "../db/client";
import type { Actor } from "../auth/can";
import { applyChange } from "../company/changes";
import { isBuilder, makeCreation, reviseCreation } from "../company/creations";
import { by, signal } from "../learning/signals";
import { ROLES, type RoleId } from "../roles/model";
import { getRole } from "../roles/store";
import { panelId, validatePanel, type PanelSpec } from "./panelSpec";
import { teamPanels } from "./panels";
import type { Tiles } from "./sections";

export type DashTemplate = { id: string; name: string; description: string; source: "fair" | "team"; role: RoleId; panels: number; by: string | null; created_at: string | null };

type Stored = { id: string; role: RoleId; title: string; maker_name: string | null; maker_email: string; created_at: string; spec: { name: string; description?: string; role: RoleId; tiles: Tiles; panels: PanelSpec[] } };

/** Fair's default for the team's role first, then every template saved on the workspace (any role), newest first. */
export async function listDashTemplates(ws: string, role: RoleId): Promise<DashTemplate[]> {
  const rows = (await sql.query("select id, role, title, maker_name, maker_email, created_at, spec from creations where workspace_id = $1 and kind = 'dashboard' and status = 'approved' order by created_at desc", [ws])) as Stored[];
  const r = ROLES[role];
  return [
    { id: "fair", name: `${r.codename} default`, description: `The Dashboard ${r.label} starts with, as Fair made it: its own sections, none hidden, no panels.`, source: "fair", role, panels: 0, by: null, created_at: null },
    ...rows.map((x) => ({ id: x.id, name: x.title, description: x.spec.description || (x.role === role ? "" : `Made on the ${ROLES[x.role]?.label ?? x.role}: its panels come along; its sections stay that team's.`), source: "team" as const, role: x.role, panels: x.spec.panels?.length ?? 0, by: x.maker_name ?? x.maker_email, created_at: x.created_at })),
  ];
}

/** Save the team's Dashboard as it is now (sections and panels) into the library. A Builder only. */
export async function saveDashTemplate(actor: Actor, ws: string, role: RoleId, name: string, description = ""): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isBuilder(actor, ws, role)) return { ok: false, error: "Only a Builder saves the Dashboard as a template." };
  const [r, panels] = await Promise.all([getRole(ws, role, actor.uid), teamPanels(ws, role)]);
  const made = await makeCreation(actor, { ws, role, kind: "dashboard", input: { name, description, tiles: r.tiles ?? {}, panels }, live: true });
  return made.ok ? { ok: true, id: made.creation.id } : { ok: false, error: made.error };
}

/** Use a template (or Fair's default) as the team's Dashboard, for everyone. A Builder only. */
export async function useDashTemplate(actor: Actor, ws: string, role: RoleId, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isBuilder(actor, ws, role)) return { ok: false, error: "Only a Builder changes the team's Dashboard." };
  const current = await teamPanels(ws, role);
  if (id === "fair") {
    // the role's own sections in Fair's order, nothing renamed; the team's panels hidden (they stay, to bring back)
    const r = await applyChange(actor, ws, role, { "tiles.order": null, "tiles.names": null, "tiles.hidden": current.length ? current.map((p) => panelId(p.key)) : null }, "Used Fair's default Dashboard");
    if (!r.ok && !/Nothing would change/.test(r.error)) return r;
    await signal(by(actor, ws, role), "dashboard.template_used", { source: "fair" });
    return { ok: true };
  }
  const t = ((await sql.query("select id, role, title, maker_name, maker_email, created_at, spec from creations where id = $1 and workspace_id = $2 and kind = 'dashboard' and status = 'approved'", [id, ws])) as Stored[])[0];
  if (!t) return { ok: false, error: "No such template." };
  // its panels become the team's: one the team has under the same key takes the template's version
  const live = (await sql.query("select id, key from creations where workspace_id = $1 and role = $2 and kind = 'panel' and status = 'approved'", [ws, role])) as { id: string; key: string }[];
  for (const p of (t.spec.panels ?? []).filter((x) => !validatePanel(x).length)) {
    const mine = live.find((x) => x.key === p.key);
    const r = mine ? await reviseCreation(actor, mine.id, ws, p as unknown as Record<string, unknown>) : await makeCreation(actor, { ws, role, kind: "panel", input: p as unknown as Record<string, unknown>, live: true });
    if (!r.ok) return { ok: false, error: `The panel "${p.title}": ${r.error}` };
  }
  const keep = new Set((t.spec.panels ?? []).map((p) => panelId(p.key)));
  const hidden = [...new Set([...(t.spec.tiles?.hidden ?? []), ...current.filter((p) => !keep.has(panelId(p.key))).map((p) => panelId(p.key))])];
  // a template from another role brings its panels; its sections are that role's and the policy leaves them out
  const r = await applyChange(actor, ws, role, {
    "tiles.order": t.spec.tiles?.order?.length ? t.spec.tiles.order : null,
    "tiles.hidden": hidden.length ? hidden : null,
    "tiles.names": t.spec.tiles?.names && Object.keys(t.spec.tiles.names).length ? t.spec.tiles.names : null,
  }, `Used the Dashboard template "${t.title}"`);
  if (!r.ok && !/Nothing would change/.test(r.error)) return r;
  await signal(by(actor, ws, role), "dashboard.template_used", { source: "team" });
  return { ok: true };
}
