/**
 * "Describe the deck you want" (Refal, 16 Oct 2026): on New deck a person writes what they want to see ("brand share,
 * top creators, then what the affiliates sold, monthly"); CeMO lays the deck out from the team's own starting points:
 * a template, the brands, how often, the platforms, slides from the library and the team's analyses. Only what the
 * library cannot show becomes a new slide, drafted as one analysis over the query builder (src/decks/slideDraft.ts)
 * and kept as the team's skill. The draft fills the form; the person checks it, creates the deck, adjusts it with
 * comments and saves it as a template from the viewer. CeMO only picks and names: every number is counted in SQL
 * when a version is made.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Actor } from "../auth/can";
import { anthropicClient, describeModelError, toolAnswer } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { CREDIT_PRICES } from "../config/credits";
import { canSpend, charge } from "../credits/ledger";
import { by, signal } from "../learning/signals";
import type { RoleId } from "../roles/model";
import type { DeckOptions } from "./page";
import { draftSlide, saveSlide } from "./slideDraft";

/** What the form takes from a draft; every key checked against the options the form was given. */
export type DeckDraft = {
  template: string;
  name: string;
  grain: "day" | "week" | "month";
  /** a brand deck's brands */
  brands: string[];
  /** a PR or Social Media deck's brand, and the platform it reads ("all" or one) */
  focus: string | null;
  platform: string;
  platforms: string[];
  /** the template family's library slides */
  slides: string[];
  /** the team's analyses to carry (team_skills keys), the new ones included */
  skills: string[];
  /** slides drafted here and kept as the team's skills */
  added: { key: string; title: string; description: string; badge: string; by?: string }[];
  /** what CeMO could not place, in plain words */
  notes: string[];
};

const MAX_NEW = 2;

/** the templates of the deck's family (a PR team's are reputation decks); all of them if the family has none */
const familyTemplates = (o: DeckOptions, family: "brand" | "reputation" | "social") => {
  const fam = o.templates.filter((t) => (family === "brand" ? !t.family : t.family === family));
  return fam.length ? fam : o.templates;
};

const TOOL = (o: DeckOptions, family: "brand" | "reputation" | "social"): Anthropic.Tool => {
  const library = family === "reputation" ? o.rep_slides : family === "social" ? o.social_slides : o.slides;
  return {
    name: "draft_deck",
    description: "Lay out the deck: a starting template, its name, how often, the brands, the slides from the library, the team's analyses, and at most two new slides for what nothing else shows.",
    input_schema: {
      type: "object",
      properties: {
        template: { type: "string", enum: familyTemplates(o, family).map((t) => t.key) },
        name: { type: "string", description: "the deck's name, plain, up to 60 characters" },
        grain: { type: "string", enum: family === "reputation" ? ["day", "week", "month"] : ["week", "month"] },
        brands: { type: "array", items: { type: "string", enum: o.brands.map((b) => b.id) }, description: family === "brand" ? "the brands to watch, the client's first when it is one of them" : "leave empty" },
        focus: { type: "string", enum: o.brands.map((b) => b.id), description: family === "brand" ? "leave out" : "the one brand the deck is about" },
        platform: { type: "string", enum: ["all", ...o.platforms], description: family === "brand" ? "leave out" : "the platform the deck reads, or all" },
        platforms: { type: "array", items: { type: "string", enum: o.platforms }, description: family === "brand" ? "the platforms the deck reads; all of them unless they name some" : "leave empty" },
        slides: { type: "array", items: { type: "string", enum: library.map((s) => s.kind) }, description: "slides from the library, in the order asked; keep the summary first" },
        skills: { type: "array", items: { type: "string", enum: o.team_skills.map((s) => s.key) }, description: "the team's own analyses that answer part of the ask" },
        new_slides: { type: "array", items: { type: "string" }, maxItems: MAX_NEW, description: "at most two sentences, each one slide the library and the analyses cannot show (\"comments that mention halal, per day\")" },
      },
      required: ["template", "name", "grain", "slides"],
      additionalProperties: false,
    },
  };
};

function brief(o: DeckOptions, family: "brand" | "reputation" | "social"): string {
  const library = family === "reputation" ? o.rep_slides : family === "social" ? o.social_slides : o.slides;
  const templates = familyTemplates(o, family);
  return [
    `Templates: ${templates.map((t) => `${t.key} (${t.name}, ${t.grain}: ${t.description})`).join("; ")}.`,
    `Library slides: ${library.map((s) => `${s.kind}: ${s.title} (${s.description})`).join("; ")}.`,
    o.team_skills.length ? `The team's analyses: ${o.team_skills.map((s) => `${s.key}: ${s.title} (${s.description})`).join("; ")}.` : "The team has no analyses of its own yet.",
    `Brands: ${o.brands.slice(0, 60).map((b) => `${b.name} (${b.id})`).join(", ")}.${o.client ? ` The team's own brand is ${o.client.name} (${o.client.brand_ids.join(", ")}).` : ""}`,
    `Platforms: ${o.platforms.join(", ")}. Data runs ${o.data_from} to ${o.data_through}.`,
  ].join("\n");
}

const SYSTEM = [
  "You lay out a slide deck for a team from what they wrote. Call draft_deck once.",
  "Start from the template closest to the ask, then pick the library slides and the team's analyses that answer it, in the order they asked. Keep the summary first.",
  "Only when a part of the ask is not covered by any library slide or analysis, describe it as a new slide (at most two). Never invent brands, platforms or slides: use the ids given.",
  "How often: what they say (daily, weekly, monthly); otherwise the template's.",
].join("\n");

export async function describeDeck(ws: string, role: RoleId, options: DeckOptions, text: string, actor: Actor, family: "brand" | "reputation" | "social"): Promise<{ ok: true; draft: DeckDraft } | { ok: false; error: string }> {
  const ask = text.trim().slice(0, 800);
  if (ask.length < 8) return { ok: false, error: "Say in a sentence or two what the deck should show." };
  if (!hasModelCredentials()) return { ok: false, error: "CeMO is not available on this server." };
  const spend = await canSpend(ws, CREDIT_PRICES.creation);
  if (!spend.ok) return { ok: false, error: spend.message };
  const client = anthropicClient({ workspace: ws, purpose: "deck_draft" });
  const tool = TOOL(options, family);
  let use: Anthropic.ToolUseBlock | undefined;
  try {
    ({ use } = await toolAnswer((req) => client.messages.create(req), { model: modelId(), max_tokens: 4000, system: SYSTEM, tools: [tool], messages: [{ role: "user", content: `${brief(options, family)}\n\nThe deck they want: ${ask}` }] }, tool.name));
  } catch (e) {
    return { ok: false, error: `CeMO could not lay it out: ${describeModelError(e).slice(0, 200)}` };
  }
  if (!use) return { ok: false, error: "CeMO did not lay out a deck; try saying it another way." };
  const d = use.input as { template?: string; name?: string; grain?: string; brands?: string[]; focus?: string; platform?: string; platforms?: string[]; slides?: string[]; skills?: string[]; new_slides?: string[] };
  const draft = cleanDraft(d, options, family);
  await charge({ ws, email: actor.email, staff: actor.staff.length > 0, kind: "creation", credits: CREDIT_PRICES.creation, ref: draft.template, note: `Deck laid out: ${draft.name}` });
  // the new slides: each drafted, tried on the newest week and kept as the team's skill (live for a Builder)
  for (const want of (d.new_slides ?? []).filter((x) => typeof x === "string" && x.trim().length > 5).slice(0, MAX_NEW)) {
    const s = await draftSlide(ws, role, want, actor, "form");
    if (!s.ok) { draft.notes.push(`"${want.slice(0, 80)}": ${s.error}`); continue; }
    const kept = await saveSlide(ws, role, s.draft.recipe, actor);
    if (!kept.ok) { draft.notes.push(`"${s.draft.recipe.title}": ${kept.error}`); continue; }
    draft.added.push({ key: kept.key, title: kept.title, description: s.draft.recipe.description, badge: kept.status === "approved" ? "Your team" : "Yours, not shared yet", by: kept.by });
    draft.skills.push(kept.key);
  }
  await signal(by(actor, ws, role), "deck.described", { template: draft.template, added: draft.added.length });
  return { ok: true, draft };
}

/** The draft with anything the options do not hold left out. Pure. */
export function cleanDraft(d: { template?: string; name?: string; grain?: string; brands?: string[]; focus?: string; platform?: string; platforms?: string[]; slides?: string[]; skills?: string[] }, o: DeckOptions, family: "brand" | "reputation" | "social"): DeckDraft {
  const templates = familyTemplates(o, family);
  const t = templates.find((x) => x.key === d.template) ?? templates[0];
  const library = new Set((family === "reputation" ? o.rep_slides : family === "social" ? o.social_slides : o.slides).map((s) => s.kind));
  const brands = new Set(o.brands.map((b) => b.id));
  const grains = family === "reputation" ? ["day", "week", "month"] : ["week", "month"];
  const slides = [...new Set((d.slides ?? []).filter((k) => library.has(k)))];
  const fallback = family === "reputation" ? t.rep_slides ?? ["summary"] : family === "social" ? t.social_slides ?? ["summary"] : t.slides;
  return {
    template: t.key,
    name: String(d.name ?? t.name).trim().slice(0, 60) || t.name,
    grain: (grains.includes(String(d.grain)) ? d.grain : t.grain) as DeckDraft["grain"],
    brands: family === "brand" ? [...new Set((d.brands ?? []).filter((b) => brands.has(b)))].slice(0, 20) : [],
    focus: family === "brand" ? null : d.focus && brands.has(d.focus) ? d.focus : o.focus,
    platform: d.platform && (d.platform === "all" || o.platforms.includes(d.platform)) ? d.platform : "all",
    platforms: family === "brand" ? ((d.platforms ?? []).filter((p) => o.platforms.includes(p)).length ? (d.platforms ?? []).filter((p) => o.platforms.includes(p)) : o.platforms) : [],
    slides: slides.length ? (slides.includes("summary") || !library.has("summary") ? slides : ["summary", ...slides]) : (fallback as string[]),
    skills: [...new Set((d.skills ?? []).filter((k) => o.team_skills.some((s) => s.key === k)))],
    added: [],
    notes: [],
  };
}
