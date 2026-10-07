/**
 * Fair adopts a client's creation (DECISIONS, 7 Oct 2026, "Teams build their own"): from CMS →
 * Client creations, a role owner turns a live team skill or deck template into part of the next
 * Fair version of the role. Its shape is copied (the query, the slides, the grain), never the
 * client's data; the role owner checks its wording in the Role Lab draft, which goes through the
 * role's tests and is released by Refal or Rafli, staged first if they like. The client keeps
 * their own creation either way, and a release never touches it.
 */
import { sql } from "../db/client";
import type { DeckTemplate } from "../decks/templates";
import { fairRecipes, saveFairRecipe } from "../recipes/store";
import type { RecipeSpec } from "../recipes/spec";
import { ROLES, type RoleId } from "../roles/model";
import { audit, draftSpec, newDraft, updateDraft, type Who } from "../roles/store";
import type { Creation } from "./creations";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "item";

/** The role's open draft, or a new one copied from its current release. */
async function openDraft(role: RoleId, who: Who, note: string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const rows = (await sql.query("select version from role_versions where role = $1 and status in ('draft','proposed') order by created_at desc limit 1", [role])) as { version: string }[];
  if (rows[0]) return { ok: true, version: rows[0].version };
  return newDraft(role, who, note);
}

export async function adoptCreation(who: Who, id: string): Promise<{ ok: true; role: RoleId; version: string; title: string; note: string } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "No such creation." };
  const c = ((await sql.query("select * from creations where id = $1", [id])) as Creation[])[0];
  if (!c || c.status !== "approved") return { ok: false, error: "Only a live creation can be adopted." };
  if (c.kind !== "skill" && c.kind !== "deck_template") return { ok: false, error: "Skills and deck templates can be adopted; house rules and memory stay the client's." };
  const role = c.role;
  const d = await openDraft(role, who, `Adopted from a client: ${c.title}`);
  if (!d.ok) return d;
  const spec = await draftSpec(role, d.version);
  if (!spec) return { ok: false, error: `No draft ${ROLES[role].codename} ${d.version}.` };
  const fair = await fairRecipes();
  let note = "";
  if (c.kind === "skill") {
    const key = `adopted-${slug(c.key ?? c.title)}`.slice(0, 49);
    const recipe: RecipeSpec = { ...(c.spec as unknown as RecipeSpec), key, roles: [role] };
    const saved = await saveFairRecipe(recipe, who.email);
    if (!saved.ok) return { ok: false, error: `It does not check out as one of Fair's: ${saved.errors.join(" ")}` };
    const r = await updateDraft(role, d.version, { recipes: [...new Set([...(spec.recipes ?? []), key])] }, who);
    if (!r.ok) return r;
    note = `Added as Fair's analysis "${key}"; check its title and description in the draft.`;
  } else {
    const t = c.spec as unknown as DeckTemplate & { replaces?: string };
    const key = `adopted-${slug(t.name ?? c.title)}`.slice(0, 40);
    // a team's own analyses exist in their workspace only: Fair's recipes come along (an adopted one under its new key), the rest stay behind
    const fairKey = (k: string) => (fair.has(k) ? k : fair.has(`adopted-${slug(k)}`.slice(0, 49)) ? `adopted-${slug(k)}`.slice(0, 49) : null);
    const kept = (t.findings ?? []).flatMap((f) => { const k = fairKey(f.skill.replace(/^recipe:/, "")); return k ? [{ ...f, skill: `recipe:${k}` }] : []; });
    const { replaces: _r, ...rest } = t;
    const def: DeckTemplate = { ...rest, key, roles: [role], ...(kept.length ? { findings: kept.map(({ by: _b, ...f }) => f) } : { findings: undefined }) };
    const r = await updateDraft(role, d.version, { template_defs: [...(spec.template_defs ?? []).filter((x) => x.key !== key), def], deck_templates: [...new Set([...spec.deck_templates, key])] }, who);
    if (!r.ok) return r;
    const left = (t.findings ?? []).length - kept.length;
    note = `Added as Fair's template "${key}"${left ? `; ${left} of the client's own slides stayed behind (adopt those skills first to bring them)` : ""}. Check its name and description in the draft.`;
  }
  await sql.query("update fair_suggestions set status = 'adopted', fair_by = $2, updated_at = now() where ref_kind = 'creation' and ref = $1 and status in ('new','seen')", [c.id, who.email]);
  await audit({ workspace_id: c.workspace_id, actor: who.email, area: "adopt", action: c.kind, path: `${role}@${d.version}:${c.id}`, note });
  return { ok: true, role, version: d.version, title: c.title, note };
}
