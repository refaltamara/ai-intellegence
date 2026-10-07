/**
 * Changing a deck, from anywhere (DECISIONS, 7 Oct 2026, "Teams build their own"): the Edit
 * page, CeMO in Chats, or @CeMO in a slide comment all end here. A change adds or drops
 * slides (the role's own and the team's analyses), switches day, week or month, renames the
 * deck or turns its schedule on or off. Preview first (what is added, dropped, kept), then
 * apply. The deck changes for whoever may edit it today; the template it came from changes
 * too when asked: a Builder's change goes live (a team template is revised, a Fair template
 * becomes the team's own copy), a Member's waits for a Builder.
 */
import type { Actor } from "../auth/can";
import { can } from "../auth/can";
import { DECK_GRAINS, type DeckGrain } from "../competitor/period";
import { SLIDES, cleanSlides } from "../competitor/slides";
import { REP_SLIDES, cleanRepSlides } from "../reputation/slides";
import { SOCIAL_SLIDES, cleanSocialSlides } from "../social/slides";
import { actOn, getCreation, isBuilder, listCreations, makeCreation, reviseCreation, type Creation } from "../company/creations";
import { fairRecipes } from "../recipes/store";
import { companyRecipes } from "../company/creations";
import type { RoleId } from "../roles/model";
import { by, signal } from "../learning/signals";
import { nextRun } from "./generate";
import { DECK_TEMPLATES } from "./templates";
import { getDeck, updateDeck, type DeckRow } from "./store";
import type { DeckSpec, FindingSpec } from "./spec";
import type { RecipeSpec } from "../recipes/spec";

export type DeckChange = {
  name?: string;
  grain?: DeckGrain;
  recurring?: boolean;
  /** the role's own slide kinds */
  add_slides?: string[];
  remove_slides?: string[];
  /** the team's analyses (a recipe key: Fair's or the team's own), each a slide; after = the slide it follows */
  add_analyses?: { recipe: string; title?: string; question?: string; after?: string }[];
  /** team slides to drop, by their key or their recipe key */
  remove_analyses?: string[];
  /** slides CeMO drafted from a sentence (src/decks/slideDraft.ts): saved as the team's skills when the change is applied */
  new_analyses?: { recipe: RecipeSpec; after?: string }[];
};

export type ChangeLine = { sign: "+" | "−" | "=" | "→"; text: string; note?: string };
/** A change CeMO proposed (in Chats or under a slide comment), as its card shows it. */
export type DeckChangeProposal = { deck_id: string; deck_name: string; change: DeckChange; lines: ChangeLine[]; dropped: string[]; template: boolean; team_template: boolean; builder: boolean };
export type DeckPreview = { spec: DeckSpec; name: string; recurring: boolean; lines: ChangeLine[]; dropped: string[]; changed: boolean };

export const roleOfSpec = (spec: DeckSpec): RoleId => (spec.rep ? "pr" : spec.social ? "social" : "brand_kol");

/** The role's slide library for this deck. */
export function libraryOf(spec: DeckSpec): { kind: string; title: string }[] {
  return spec.rep ? REP_SLIDES : spec.social ? SOCIAL_SLIDES : SLIDES.filter((s) => s.kind !== "findings");
}

const slidesOf = (spec: DeckSpec): string[] => (spec.rep?.slides ?? spec.social?.slides ?? spec.slides) as string[];
const grainWords = (g: DeckGrain) => (g === "day" ? "Day on day" : g === "week" ? "Week on week" : "Month on month");
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()).slice(0, max) : []);

/** A change as anyone may send it, kept to known shapes. */
export function cleanChange(input: unknown): DeckChange {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: DeckChange = {};
  if (str(o.name, 80)) out.name = str(o.name, 80);
  if (DECK_GRAINS.includes(o.grain as DeckGrain)) out.grain = o.grain as DeckGrain;
  if (typeof o.recurring === "boolean") out.recurring = o.recurring;
  if (list(o.add_slides).length) out.add_slides = list(o.add_slides);
  if (list(o.remove_slides).length) out.remove_slides = list(o.remove_slides);
  const adds = (Array.isArray(o.add_analyses) ? o.add_analyses : [])
    .map((a) => (typeof a === "string" ? { recipe: a } : (a && typeof a === "object" ? a : {}) as Record<string, unknown>))
    .map((a) => ({ recipe: str(a.recipe, 60).replace(/^recipe:/, ""), ...(str(a.title, 80) ? { title: str(a.title, 80) } : {}), ...(str(a.question, 300) ? { question: str(a.question, 300) } : {}), ...(str(a.after, 30) ? { after: str(a.after, 30) } : {}) }))
    .filter((a) => /^[a-z0-9][a-z0-9-]{2,48}$/.test(a.recipe))
    .slice(0, 6);
  if (adds.length) out.add_analyses = adds;
  if (list(o.remove_analyses).length) out.remove_analyses = list(o.remove_analyses);
  // checked in full when saved (makeCreation validates a skill); here only its shape
  const fresh = (Array.isArray(o.new_analyses) ? o.new_analyses : [])
    .map((a) => (a && typeof a === "object" ? a : {}) as Record<string, unknown>)
    .filter((a) => a.recipe && typeof a.recipe === "object" && typeof (a.recipe as RecipeSpec).title === "string" && (a.recipe as RecipeSpec).query && typeof (a.recipe as RecipeSpec).query === "object")
    .map((a) => ({ recipe: a.recipe as RecipeSpec, ...(str(a.after, 30) ? { after: str(a.after, 30) } : {}) }))
    .slice(0, 2);
  if (fresh.length) out.new_analyses = fresh;
  return out;
}

/** The analyses this person may put on a deck: Fair's recipes and the team's own (their drafts too). */
async function analyses(ws: string, role: RoleId, email: string | null): Promise<Map<string, { title: string; description: string; by: string | null }>> {
  const out = new Map<string, { title: string; description: string; by: string | null }>();
  for (const [k, r] of await fairRecipes()) if (r.roles.includes(role)) out.set(k, { title: r.title, description: r.description, by: null });
  for (const r of await companyRecipes(ws, role, email)) out.set(r.key, { title: r.title, description: r.description, by: r._creation.maker });
  return out;
}

/** What the change would do to the deck, line by line. Pure on its inputs except reading the team's analyses. */
export async function previewDeckChange(deck: Pick<DeckRow, "workspace_id" | "name" | "spec" | "recurring">, change: DeckChange, email: string | null): Promise<DeckPreview> {
  const spec: DeckSpec = JSON.parse(JSON.stringify(deck.spec));
  const role = roleOfSpec(spec);
  const lib = libraryOf(spec);
  const title = (k: string) => lib.find((s) => s.kind === k)?.title ?? k;
  const lines: ChangeLine[] = [];
  const dropped: string[] = [];
  let slides = slidesOf(spec);
  for (const k of change.add_slides ?? []) {
    if (!lib.some((s) => s.kind === k)) { dropped.push(`"${k}" is not a slide this deck can carry.`); continue; }
    if (slides.includes(k)) { dropped.push(`${title(k)} is already in the deck.`); continue; }
    slides = [...slides, k];
    lines.push({ sign: "+", text: title(k) });
  }
  for (const k of change.remove_slides ?? []) {
    if (k === "summary") { dropped.push("The summary always opens the deck."); continue; }
    if (!slides.includes(k)) {
      // a team slide named as a slide
      if ((spec.findings ?? []).some((f) => f.key === k || f.skill === `recipe:${k}`)) (change.remove_analyses ??= []).push(k);
      else dropped.push(`${title(k)} is not in the deck.`);
      continue;
    }
    slides = slides.filter((x) => x !== k);
    lines.push({ sign: "−", text: title(k) });
  }
  if (spec.rep) spec.rep.slides = cleanRepSlides(slides);
  else if (spec.social) spec.social.slides = cleanSocialSlides(slides);
  else spec.slides = cleanSlides(slides);

  let findings: FindingSpec[] = [...(spec.findings ?? [])];
  for (const k of change.remove_analyses ?? []) {
    const f = findings.find((x) => x.key === k || x.skill === `recipe:${k}`);
    if (!f) continue;
    findings = findings.filter((x) => x !== f);
    lines.push({ sign: "−", text: f.title, note: "your team's slide" });
  }
  if (change.add_analyses?.length) {
    const known = await analyses(deck.workspace_id, role, email);
    for (const a of change.add_analyses) {
      const r = known.get(a.recipe);
      if (!r) { dropped.push(`No analysis "${a.recipe}" on this team.`); continue; }
      if (findings.some((f) => f.skill === `recipe:${a.recipe}`)) { dropped.push(`${r.title} is already in the deck.`); continue; }
      if (findings.length >= 6) { dropped.push("A deck holds six of the team's slides at most."); break; }
      const used = new Set(findings.map((f) => f.key));
      let n = findings.length + 1;
      while (used.has(`t${n}`)) n++;
      const after = a.after && slidesOf(spec).includes(a.after) ? a.after : undefined;
      findings.push({ key: `t${n}`, skill: `recipe:${a.recipe}`, params: {}, question: a.question ?? r.description, title: a.title ?? r.title, ...(after ? { after } : {}), ...(r.by ? { by: r.by } : {}) });
      lines.push({ sign: "+", text: a.title ?? r.title, note: after ? `your team's slide, after ${title(after)}` : "your team's slide" });
    }
  }
  for (const a of change.new_analyses ?? []) {
    if (findings.length >= 6) { dropped.push("A deck holds six of the team's slides at most."); break; }
    lines.push({ sign: "+", text: a.recipe.title, note: "new slide, kept as your team's skill" });
  }
  if (findings.length) spec.findings = findings;
  else delete spec.findings;
  // a Brand & KOL deck prints its findings on the findings slides
  if (!spec.rep && !spec.social) spec.slides = cleanSlides(findings.length ? [...spec.slides, "findings"] : spec.slides.filter((k) => k !== "findings"));

  let grain = spec.grain;
  if (change.grain && change.grain !== spec.grain) {
    if (change.grain === "day" && !spec.rep) dropped.push("Day on day is for PR decks; this one keeps weeks or months.");
    else { lines.push({ sign: "→", text: `${grainWords(spec.grain)} → ${grainWords(change.grain)}` }); grain = change.grain; }
  }
  spec.grain = grain;
  const name = change.name && change.name !== deck.name ? change.name : deck.name;
  if (name !== deck.name) { lines.push({ sign: "→", text: `Name: ${deck.name} → ${name}` }); spec.title = name.slice(0, 60); }
  const recurring = change.recurring ?? deck.recurring;
  if (recurring !== deck.recurring) lines.push({ sign: "→", text: recurring ? `Repeats ${grain === "day" ? "every morning" : `every ${grain}`}` : "Stops repeating" });
  const changed = lines.length > 0;
  if (changed && !lines.some((l) => l.text.startsWith(grainWords(spec.grain)) || l.sign === "→")) lines.push({ sign: "=", text: `${grainWords(grain)}${recurring ? ", repeating" : ""}`, note: "unchanged" });
  return { spec, name, recurring, lines, dropped, changed };
}

export type TemplateOutcome = { status: Creation["status"]; title: string; id: string; how: "revised" | "new" | "waiting" } | { error: string };

/** The template side of a change: revise the team's, copy Fair's into the team's, or send it to a Builder. */
async function changeTemplate(actor: Actor, deck: DeckRow, spec: DeckSpec, name: string, recurring: boolean): Promise<TemplateOutcome> {
  const role = roleOfSpec(spec);
  const builder = isBuilder(actor, deck.workspace_id, role);
  const input: Record<string, unknown> = {
    name, title: spec.title, grain: spec.grain, recurring,
    slides: slidesOf(spec),
    findings: (spec.findings ?? []).filter((f) => f.skill.startsWith("recipe:")),
  };
  const team = deck.template?.startsWith("co-")
    ? (await listCreations(deck.workspace_id, { role, kinds: ["deck_template"], status: ["approved"] })).find((c) => c.key === deck.template) ?? null
    : null;
  if (team) {
    const base = team.spec as Record<string, unknown>;
    const merged = { ...input, name: String(base.name ?? team.title), description: base.description, from: base.from };
    if (builder) {
      const r = await reviseCreation(actor, team.id, deck.workspace_id, merged);
      return r.ok ? { status: r.creation.status, title: r.creation.title, id: r.creation.id, how: "revised" } : { error: r.error };
    }
    const made = await makeCreation(actor, { ws: deck.workspace_id, role, kind: "deck_template", input: { ...merged, key: team.key, replaces: team.id } });
    if (!made.ok) return { error: made.error };
    const sent = await actOn(actor, made.creation.id, deck.workspace_id, "submit");
    return sent.ok ? { status: sent.creation.status, title: made.creation.title, id: made.creation.id, how: "waiting" } : { error: sent.error };
  }
  // from one of Fair's templates (or none): the team gets its own copy, Fair's stays as it is
  const fair = DECK_TEMPLATES.find((t) => t.key === deck.template);
  const made = await makeCreation(actor, { ws: deck.workspace_id, role, kind: "deck_template", input: { ...input, from: fair?.key, description: fair ? `${fair.description} The team's version.` : `Made from ${name}.` }, live: builder });
  if (!made.ok) return { error: made.error };
  if (builder) return { status: made.creation.status, title: made.creation.title, id: made.creation.id, how: "new" };
  const sent = await actOn(actor, made.creation.id, deck.workspace_id, "submit");
  return sent.ok ? { status: sent.creation.status, title: made.creation.title, id: made.creation.id, how: "waiting" } : { error: sent.error };
}

export type ApplyOutcome = { ok: true; deck: DeckRow; preview: DeckPreview; template: TemplateOutcome | null } | { ok: false; error: string };

/**
 * Apply a change. Anyone on the team who can use the deck's role changes the deck (as Edit does);
 * `template` also changes the template it came from, by the rules above.
 */
export async function applyDeckChange(actor: Actor, deckId: string, ws: string, change: DeckChange, o: { template?: boolean; from: "chat" | "comment" | "form" }): Promise<ApplyOutcome> {
  const deck = await getDeck(deckId, ws);
  if (!deck) return { ok: false, error: "No such deck." };
  const role = roleOfSpec(deck.spec);
  if (!can(actor, "role.use", { workspace: ws, role })) return { ok: false, error: "You are not on this team." };
  // a slide CeMO drafted is kept as the team's skill first, then added like any other analysis
  if (change.new_analyses?.length) {
    const { saveSlide } = await import("./slideDraft");
    const adds = [...(change.add_analyses ?? [])];
    for (const a of change.new_analyses) {
      const saved = await saveSlide(ws, role, a.recipe, actor);
      if (!saved.ok) return { ok: false, error: `The new slide could not be kept: ${saved.error}` };
      adds.push({ recipe: saved.key, title: saved.title, ...(a.after ? { after: a.after } : {}) });
    }
    change = { ...change, add_analyses: adds, new_analyses: undefined };
  }
  const preview = await previewDeckChange(deck, change, actor.email);
  if (!preview.changed && !o.template) return { ok: false, error: preview.dropped.join(" ") || "Nothing would change." };
  let updated = deck;
  if (preview.changed) {
    const grainMoved = preview.spec.grain !== deck.spec.grain;
    const turnedOn = preview.recurring && !deck.recurring;
    updated = (await updateDeck(deck.id, ws, {
      name: preview.name !== deck.name ? preview.name : undefined,
      spec: preview.spec,
      recurring: preview.recurring !== deck.recurring ? preview.recurring : undefined,
      ...(!preview.recurring ? { next_run_at: null } : turnedOn || grainMoved ? { next_run_at: nextRun(preview.spec.grain) } : {}),
    }))!;
  }
  const template = o.template ? await changeTemplate(actor, updated, preview.spec, preview.name, preview.recurring) : null;
  // a new live team template becomes the deck's own, so the next change revises it
  if (template && !("error" in template) && template.how === "new") {
    const c = await getCreation(template.id, ws);
    if (c?.key) await (await import("../db/client")).sql.query("update decks set template = $3, updated_at = now() where id = $1 and workspace_id = $2", [deck.id, ws, c.key]);
  }
  await signal(by(actor, ws, role), "deck.changed", {
    deck: deck.id, from: o.from, template: !!o.template,
    added: preview.lines.filter((l) => l.sign === "+").length, removed: preview.lines.filter((l) => l.sign === "−").length, grain: preview.spec.grain !== deck.spec.grain,
  });
  return { ok: true, deck: updated, preview, template };
}

/** A deck by id, or by its name as a person says it ("the Kahf crisis report"). */
export async function findDeck(ws: string, ref: string, decks: Pick<DeckRow, "id" | "name">[]): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/.test(ref)) return decks.some((d) => d.id === ref) ? ref : null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const want = norm(ref);
  const exact = decks.find((d) => norm(d.name) === want);
  if (exact) return exact.id;
  const words = want.split(" ").filter((w) => w.length > 2 && !["the", "deck", "our"].includes(w));
  const scored = decks.map((d) => ({ d, s: words.filter((w) => norm(d.name).includes(w)).length })).sort((a, b) => b.s - a.s);
  return scored[0]?.s ? scored[0].d.id : null;
}
