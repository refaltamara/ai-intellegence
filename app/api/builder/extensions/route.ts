/**
 * A workspace's extensions (src/extensions/). POST { action, def_id, ... }:
 *   upload    { csv }   a Builder uploads values (two columns: creator handle or post link, value)
 *   estimate            sample and price a draft again (a rule is free; CeMO reads 50 rows)
 * Making, approving and removing go through the extension's creation (/api/builder/creations).
 */
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { getWorkspace } from "@/workspace/store";
import { estimateDef, getDef, invalidateExt } from "@/extensions/store";
import { fillFromFile, scopeCounts } from "@/extensions/fill";
import { sql } from "@/db/client";
import { toJson } from "@/db/json";
import { audit } from "@/roles/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const no = (error: string, status = 400) => Response.json({ error }, { status });

/** two columns, comma, semicolon or tab separated; a header row is skipped when its value is not a value */
function parseCsv(text: string): { key: string; value: string }[] {
  return text.split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((x) => x.trim().replace(/^"|"$/g, ""))).filter((c) => c.length >= 2 && c[0] && c[1]).slice(0, 50_000).map((c) => ({ key: c[0], value: c[1] }));
}

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return no("unauthorised", 401);
  const b = (await req.json().catch(() => ({}))) as { action?: string; def_id?: string; csv?: string };
  const def = await getDef(String(b.def_id ?? ""), ws);
  if (!def) return no("No such extension.", 404);
  // a Builder of any team in the workspace looks after its data
  const roles = (await getWorkspace(ws))?.roles ?? [];
  const builder = roles.some((r) => can(actor, "company.change", { workspace: ws, role: r }));
  if (b.action === "upload") {
    if (!builder) return no("Only a Builder uploads values.", 403);
    if (def.source !== "file") return no("This extension is not filled from a file.");
    if (!["approved", "live", "filling"].includes(def.status)) return no("Approve it first.");
    const rows = parseCsv(String(b.csv ?? ""));
    if (!rows.length) return no("The file has no rows of two columns.");
    const r = await fillFromFile(def, rows);
    const c = await scopeCounts(def);
    await sql.query("update ext_defs set status = 'live', progress = $2::jsonb, updated_at = now() where id = $1", [def.id, toJson({ done: c.done, total: c.rows })]);
    invalidateExt(ws);
    await audit({ workspace_id: ws, actor: actor.email, area: "extension", action: "upload", path: def.key, new: { saved: r.saved, unknown: r.unknown_keys.length } });
    return Response.json({ ok: true, ...r });
  }
  if (b.action === "estimate") {
    if (def.status !== "draft") return no("Only a draft is estimated again.");
    if (def.maker_email !== actor.email && !builder) return no("forbidden", 403);
    const est = await estimateDef(def, { email: actor.email, staff: actor.staff.length > 0 });
    return Response.json({ ok: true, estimate: est });
  }
  return no("Unknown action.");
}
