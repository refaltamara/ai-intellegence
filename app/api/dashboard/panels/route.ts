/**
 * The team's own Dashboard panels (src/dashboard/panels.ts), Builders only: the Dashboard is locked for Members
 * (Refal, 16 Oct 2026). POST { action, ... }:
 *   draft   { text, scope, key? }   CeMO drafts a panel (or changes the panel with that key) and runs it over the scope
 *   save    { spec }                add it for everyone, or replace the live panel with the same key
 *   remove  { key }                 take it off (it can be brought back from Our <team>)
 * The scope is the Dashboard's own filters (dates, platform, brands), never numbers.
 */
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { actOn, isBuilder, makeCreation, reviseCreation } from "@/company/creations";
import { draftPanel } from "@/dashboard/panelDraft";
import type { PanelScope } from "@/dashboard/panels";
import { teamPanels } from "@/dashboard/panels";
import { validatePanel, type PanelSpec } from "@/dashboard/panelSpec";
import { by, signal } from "@/learning/signals";
import { sql } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const no = (error: string, status = 400) => Response.json({ error }, { status });

function cleanScope(v: unknown): PanelScope | null {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (typeof s.from !== "string" || typeof s.to !== "string" || !DAY.test(s.from) || !DAY.test(s.to) || s.from > s.to) return null;
  const platform = typeof s.platform === "string" && /^[a-z]{1,12}$/.test(s.platform) ? s.platform : "all";
  const brands = Array.isArray(s.brands) ? s.brands.filter((b): b is string => typeof b === "string" && b.length <= 80).slice(0, 30) : [];
  return { from: s.from, to: s.to, platform, brands };
}

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return no("unauthorised", 401);
  const role = await currentRole(ws);
  if (!isBuilder(actor, ws, role.id)) return no("Only a Builder changes the team's Dashboard.", 403);
  const b = (await req.json().catch(() => ({}))) as { action?: string; text?: unknown; scope?: unknown; key?: unknown; spec?: unknown };
  const live = async (key: string) => ((await sql.query("select id from creations where workspace_id = $1 and role = $2 and kind = 'panel' and status = 'approved' and key = $3", [ws, role.id, key])) as { id: string }[])[0] ?? null;
  if (b.action === "draft") {
    const scope = cleanScope(b.scope);
    if (!scope) return no("The Dashboard's period did not come with the request.");
    const current = typeof b.key === "string" ? (await teamPanels(ws, role.id)).find((p) => p.key === b.key) ?? null : null;
    const r = await draftPanel(ws, role.id, typeof b.text === "string" ? b.text : "", actor, { scope, current });
    return r.ok ? Response.json(r.draft) : no(r.error);
  }
  if (b.action === "save") {
    const spec = (b.spec && typeof b.spec === "object" ? b.spec : {}) as PanelSpec;
    const errors = validatePanel(spec);
    if (errors.length) return no(`The panel does not check out: ${errors.join(" ")}`);
    const mine = await live(spec.key);
    const r = mine ? await reviseCreation(actor, mine.id, ws, spec as unknown as Record<string, unknown>) : await makeCreation(actor, { ws, role: role.id, kind: "panel", input: spec as unknown as Record<string, unknown>, live: true });
    if (!r.ok) return no(r.error);
    await signal(by(actor, ws, role.id), "dashboard.panel_added", { chart: spec.chart, revised: !!mine });
    return Response.json({ ok: true, key: spec.key });
  }
  if (b.action === "remove") {
    const mine = typeof b.key === "string" ? await live(b.key) : null;
    if (!mine) return no("No such panel.", 404);
    const r = await actOn(actor, mine.id, ws, "remove");
    return r.ok ? Response.json({ ok: true }) : no(r.error);
  }
  return no("Unknown action.");
}
