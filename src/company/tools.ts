/**
 * What CeMO can make for a team (CMS plan, "The client side"), and Builder mode. Anyone
 * on a team can ask CeMO for a skill, a deck template, a house rule, a fact to remember
 * or a word to use; CeMO drafts it, tries a skill on the team's own data, and shows a
 * card. The person adds it (a Builder: live for everyone) or sends it to the Builder (a
 * Member). In Builder mode CeMO can also propose changes to the team's version of the
 * role; the Builder applies them with the card's button. CeMO never applies anything:
 * the server checks the level and the guard rails on every button.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Actor } from "../auth/can";
import { COMMENT_GROUP_BY, COMMENT_METRICS, ENTITIES, GROUP_BY, METRICS } from "../query/builder";
import { FILTER_SCHEMA } from "../chat/tools";
import { RECIPE_PARAMS, type RecipeInput, type RecipeSpec } from "../recipes/spec";
import { runRecipe } from "../recipes/run";
import { SECTIONS } from "../dashboard/sections";
import { templatesFor } from "../decks/templates";
import { SLIDES } from "../competitor/slides";
import { REP_SLIDES } from "../reputation/slides";
import { SOCIAL_SLIDES } from "../social/slides";
import type { RoleId, RoleModel } from "../roles/model";
import { POLICY_HELP, companyPaths, valueAt } from "../roles/policy";
import type { Evidence } from "../skills/types";
import { actOn, isBuilder, makeCreation, type Creation, type CreationKind } from "./creations";
import { createDraftDef, estimateDef } from "../extensions/store";
import { dimName, type Estimate, type ExtDef, type ExtDefInput } from "../extensions/spec";
import { companyState, fairShown, previewChange, type Preview } from "./changes";
import { charge } from "../credits/ledger";
import { describeModelError } from "../chat/client";
import { CREDIT_PRICES } from "../config/credits";

export const MAKE_TOOLS = ["make_skill", "make_deck_template", "remember_for_team", "make_extension"] as const;
export const BUILDER_TOOLS = ["change_team"] as const;

/** what the card shows and its buttons act on */
export type Proposal =
  | { type: "creation"; id: string; kind: CreationKind; title: string; status: Creation["status"]; builder: boolean; detail: string[] }
  | { type: "change"; changes: Record<string, unknown>; preview: Preview; note: string; builder: boolean }
  | { type: "extension"; id: string; def_id: string; title: string; status: Creation["status"]; builder: boolean; target: string; source: string; values: string[]; estimate: Estimate; stopped?: string };

export const ACTIVITY: Record<string, string> = {
  make_skill: "Drafting the analysis and trying it on your data",
  make_deck_template: "Drafting the deck template",
  remember_for_team: "Writing it down for the team",
  change_team: "Checking what the change would do",
  make_extension: "Drafting it and trying it on a sample",
};

function slideKinds(role: RoleId) {
  return role === "pr" ? REP_SLIDES : role === "social" ? SOCIAL_SLIDES : SLIDES;
}

export function makeTools(role: RoleId, ext: ExtDef[] = []): Anthropic.Tool[] {
  const slides = slideKinds(role);
  const extDims = ext.map((d) => dimName(d.key));
  return [
    {
      name: "make_skill",
      description:
        "Only when the person asks you to make, build or save an analysis for the team to reuse (\"make me a skill that shows…\", \"save this as a report I can run every week\"). Write it as a fixed query over the database plus the inputs a person may change; it is checked, tried on the team's data and shown as a card the person adds or sends to their Builder. Never call it to answer a question. The query uses the same entities, metrics, group_by and filters as the metrics query; leave dates out (the window input sets them).",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "plain title, up to 60 characters, e.g. \"Merchant complaints by topic\"" },
          description: { type: "string", description: "one line: what it answers" },
          activity: { type: "string", description: "shown while it runs, up to 80 characters; {{brand}} and {{days}} are filled, e.g. \"Reading {{days}} days of comments about {{brand}}\"" },
          examples: { type: "array", items: { type: "string" }, description: "one to three questions it answers" },
          query: {
            type: "object",
            properties: {
              entity: { type: "string", enum: [...ENTITIES] },
              metrics: { type: "array", items: { type: "string", enum: [...new Set([...METRICS, ...COMMENT_METRICS])] } },
              group_by: { type: "array", items: { type: "string", enum: [...new Set([...GROUP_BY, ...COMMENT_GROUP_BY, ...extDims])] } },
              filters: FILTER_SCHEMA,
              order_by: { type: "string" },
              limit: { type: "integer" },
            },
            required: ["entity", "metrics"],
            additionalProperties: false,
          },
          params: { type: "array", items: { type: "string", enum: [...RECIPE_PARAMS] }, description: "inputs a person may give: brand (defaults to the client brand), window, platform, topic (comments only)" },
          present: { type: "string", enum: ["table", "ranked", "chart"] },
          caveat: { type: "string", description: "optional: one sentence every answer from it should keep in mind" },
        },
        required: ["title", "description", "activity", "examples", "query", "params", "present"],
        additionalProperties: false,
      },
      strict: false,
    } as Anthropic.Tool,
    {
      name: "make_deck_template",
      description:
        "Only when the person asks to make or save a deck template for the team (\"make a Board monthly from the monthly review without the voices slide\"). Start from one of Fair's templates and pick the slides; it is shown as a card the person adds or sends to their Builder, and it then appears in Decks → New deck.\n" +
        `Fair's templates on this team: ${templatesFor(role).map((t) => `${t.key} (${t.name})`).join(", ") || "none"}.\nSlides: ${slides.map((s) => `${s.kind} (${s.title})`).join(", ")}.`,
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "up to 60 characters" },
          description: { type: "string" },
          from: { type: "string", enum: templatesFor(role).map((t) => t.key) },
          slides: { type: "array", items: { type: "string", enum: slides.map((s) => s.kind) } },
          grain: { type: "string", enum: ["week", "month"] },
          recurring: { type: "boolean" },
        },
        required: ["name", "slides", "grain"],
        additionalProperties: false,
      },
      strict: false,
    } as Anthropic.Tool,
    {
      name: "remember_for_team",
      description:
        "Only when the person asks you to remember something for the team, or states a lasting team preference in a way that should hold beyond this conversation (\"we call it isu, not issue\", \"never mention OJK without saying Legal must review\", \"our fiscal month starts on the 26th\"). kind rule: how you should work or draft; fact: context to keep in mind (never a source for a number); term: a word the team uses instead of another. A correction about the data itself (which brands count, what a post is about) is not for this: say Fair's data team handles it. Shown as a card the person saves or sends to their Builder.",
      input_schema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["rule", "fact", "term"] },
          text: { type: "string", description: "rule or fact, one sentence" },
          say: { type: "string", description: "term: the word to use" },
          not: { type: "string", description: "term: the word it replaces" },
        },
        required: ["kind"],
        additionalProperties: false,
      },
      strict: false,
    } as Anthropic.Tool,
    {
      name: "make_extension",
      description:
        "Only when the person asks to add their own data on top of the core: a field on creators, posts or comments with the values it may take (\"add a Persona table: Mom, Student, Office worker; tag every creator\", \"mark each complaint's severity\"). The core data never changes; this adds to it for this workspace. Values come from keyword rules (free, computed in the database), a file the Builder uploads, or you reading each row (cemo: costs credits per row). It is drafted, tried on a sample and priced, then shown as a card: a Builder approves it to fill it, a Member sends it to their Builder. Once filled it can be grouped and filtered as ext_<key> in analyses, skills and decks. Prefer rules when clear words mark each value; use cemo when it takes judgement." +
        (ext.length ? `\nAlready in this workspace: ${ext.map((d) => `ext_${d.key} (${d.name} on ${d.target}s: ${d.values.map((v) => v.name).join(", ")})`).join("; ")}.` : ""),
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "e.g. Persona" },
          target: { type: "string", enum: ["creator", "post", "comment"] },
          values: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, hint: { type: "string", description: "how to recognise one" } }, required: ["name"] }, description: "2 to 12 values" },
          source: { type: "string", enum: ["rule", "cemo", "file"] },
          rules: { type: "array", items: { type: "object", properties: { value: { type: "string" }, terms: { type: "array", items: { type: "string" } } }, required: ["value", "terms"] }, description: "rule: the words (Indonesian and English) that mark each value, whole words; the first value whose words appear wins" },
          guide: { type: "string", description: "cemo: how the team decides, in their words" },
          scope: { type: "object", properties: { brands: { type: "array", items: { type: "string" } }, platforms: { type: "array", items: { type: "string" } }, since: { type: "string", description: "YYYY-MM-DD" }, min_followers: { type: "integer" }, min_views: { type: "integer" } }, description: "which rows: empty = every row of the target here; comments read by cemo need brands or a start date" },
        },
        required: ["name", "target", "values", "source"],
        additionalProperties: false,
      },
      strict: false,
    } as Anthropic.Tool,
  ];
}

export function builderTools(role: RoleId): Anthropic.Tool[] {
  return [
    {
      name: "change_team",
      description:
        "Builder mode only. Propose a change to the team's own version of the role: thresholds, Dashboard sections (hide, rename, order), Chats' welcome and suggested questions, the sidebar, the deck templates on offer. Pass the fields as dotted paths with their new values; null returns a field to Fair's. The server checks each field against its guard rails and shows the Builder a card with what changes; they apply it. Never say it is applied.",
      input_schema: {
        type: "object",
        properties: {
          changes: { type: "object", description: `dotted path → new value (null = back to Fair's). Paths on this team: ${Object.keys(POLICY_HELP).filter((p) => !POLICY_HELP[p].roles || POLICY_HELP[p].roles!.includes(role)).join(", ")}. Dashboard section ids: ${SECTIONS[role].map((s) => s.key).join(", ")}.` },
          note: { type: "string", description: "one line: why, in the Builder's words" },
        },
        required: ["changes", "note"],
        additionalProperties: false,
      },
      strict: false,
    } as Anthropic.Tool,
  ];
}

const show = (v: unknown) => (v == null ? "Fair's" : Array.isArray(v) ? v.join(", ") || "none" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** The Builder-mode block of the system prompt: what this team may change, and what it holds now. */
export async function builderPrompt(ws: string, role: RoleModel, client: string): Promise<string> {
  const st = await companyState(ws, role.id);
  const lines = companyPaths(st.fair).map((p) => `- ${p}: ${POLICY_HELP[p].label}; ${POLICY_HELP[p].range}. Now: ${show(valueAt(st.effective, p))}${st.changes.some((c) => c.path === p) ? ` (changed by ${client}; Fair's: ${show(fairShown(st.fair, p))})` : ""}.`);
  return [
    `Builder mode is on: the person is a Builder of ${client}'s ${role.codename} (${role.label}), on Fair's ${role.codename} ${st.fair.version}, ${st.follows}. Help them shape it for everyone on the team, mostly by doing what they ask.`,
    "Propose changes with change_team and say in one sentence what the card shows; they apply it with the button. Make skills, deck templates, house rules, facts and vocabulary with the other tools; as a Builder they add them for everyone from the card.",
    "What may change, with its guard rails and the value now:",
    ...lines,
    `Dashboard sections on this team: ${SECTIONS[role.id].map((s) => `${s.key} (${s.label})`).join(", ")}.`,
    "Out of reach whatever is asked: how any number is computed, the core data (brands, handles, which posts count, topics; that is Fair's data team), the status ladder's levels and their order, other workspaces. Say so plainly in one sentence and offer what is possible.",
  ].join("\n");
}

type Exec = { content: string; isError: boolean; proposal?: Proposal; title: string; rows?: Record<string, unknown>[]; evidence?: Evidence[]; meta?: Record<string, unknown> };

/** Run one of the tools above for this person on this team. */
export async function executeTeamTool(name: string, input: Record<string, unknown>, ctx: { actor: Actor; ws: string; role: RoleModel; builderMode: boolean }): Promise<Exec> {
  const builder = isBuilder(ctx.actor, ctx.ws, ctx.role.id);
  const err = (m: string, title = "Not saved"): Exec => ({ content: JSON.stringify({ status: "error", message: m }), isError: true, title });
  if (name === "change_team") {
    if (!ctx.builderMode || !builder) return err("Only a Builder in Builder mode can change the team's version.");
    const changes = (input.changes && typeof input.changes === "object" && !Array.isArray(input.changes) ? input.changes : {}) as Record<string, unknown>;
    const preview = await previewChange(ctx.ws, ctx.role.id, changes);
    const note = String(input.note ?? "").slice(0, 200);
    if (!preview.lines.length) return { content: JSON.stringify({ status: "nothing", dropped: preview.dropped, message: preview.dropped.length ? "Nothing in it can change; say why in one sentence." : "It is already like that." }), isError: false, title: "No change" };
    return {
      content: JSON.stringify({ status: "proposed", changes: preview.lines.map((l) => ({ field: l.label, from: show(l.from), to: show(l.to) })), dropped: preview.dropped, note: "Shown to the Builder as a card with Apply; not applied yet. Say what changes in one sentence." }),
      isError: false,
      title: "Change for the team",
      proposal: { type: "change", changes: Object.fromEntries(preview.lines.map((l) => [l.path, changes[l.path]])), preview, note, builder },
    };
  }
  const kind: CreationKind | null = name === "make_skill" ? "skill" : name === "make_deck_template" ? "deck_template" : name === "make_extension" ? "extension" : name === "remember_for_team" ? (["rule", "fact", "term"].includes(String(input.kind)) ? (input.kind as CreationKind) : null) : null;
  if (!kind) return err("Unknown kind.");
  const made = await makeCreation(ctx.actor, { ws: ctx.ws, role: ctx.role.id, kind, input });
  if (!made.ok) return { ...err(made.error), content: JSON.stringify({ status: "refused", message: made.error, note: "Say why in one plain sentence and offer a version that would work." }) };
  const c = made.creation;
  // CeMO drafting something for the team costs credits; using it afterwards costs what any question costs
  await charge({ ws: ctx.ws, email: ctx.actor.email, staff: ctx.actor.staff.length > 0, kind: "creation", credits: CREDIT_PRICES.creation, ref: c.id, note: c.title });
  const next = builder ? "they add it for everyone from the card." : "they send it to their Builder from the card; until then it works for them only.";
  if (kind === "extension") {
    // the definition, then a sample and an estimate before anyone approves (src/extensions/)
    const made2 = await createDraftDef(ctx.ws, input as Partial<ExtDefInput>, ctx.actor.email, c.id);
    if (!made2.ok) {
      await actOn(ctx.actor, c.id, ctx.ws, "discard").catch(() => undefined);
      return { ...err(made2.error), content: JSON.stringify({ status: "refused", message: made2.error, note: "Say why in one plain sentence." }) };
    }
    let est: Awaited<ReturnType<typeof estimateDef>>;
    try {
      est = await estimateDef(made2.def, { email: ctx.actor.email, staff: ctx.actor.staff.length > 0 });
    } catch (e) {
      // the sample could not be read (the model unavailable): nothing is left half-made
      await actOn(ctx.actor, c.id, ctx.ws, "discard").catch(() => undefined);
      const m = `CeMO could not read the sample: ${describeModelError(e).slice(0, 200)}`;
      return { ...err(m), content: JSON.stringify({ status: "error", message: m, note: "Say so in one sentence; keyword rules work without reading each row." }) };
    }
    const d = made2.def;
    return {
      content: JSON.stringify({ status: "drafted", name: d.name, key: `ext_${d.key}`, source: d.source, rows_in_scope: est.rows, sample: { counts: est.counts, examples: est.examples.slice(0, 6) }, credits_to_fill_now: est.credits_now, credits_per_day_after: est.credits_per_day, sample_credits: est.sample_credits, ...(est.stopped ? { stopped: est.stopped } : {}), note: `Drafted and tried; ${builder ? "the Builder approves it from the card, which fills it" : "they send it to their Builder from the card"}. Say in one or two sentences what the sample shows and what filling costs, using only these numbers.` }),
      isError: false,
      title: d.name,
      proposal: { type: "extension", id: c.id, def_id: d.id, title: d.name, status: c.status, builder, target: d.target, source: d.source, values: d.values.map((v) => v.name), estimate: est, ...(est.stopped ? { stopped: est.stopped } : {}) },
    };
  }
  if (kind === "skill") {
    const r = await runRecipe(c.spec as unknown as RecipeSpec, {} as RecipeInput, ctx.ws).catch((e) => ({ status: "error", message: (e as Error).message, rows: [], evidence: [], meta: {} }) as unknown as Awaited<ReturnType<typeof runRecipe>>);
    return {
      content: JSON.stringify({ status: "drafted", title: c.title, tried: { status: r.status, message: r.message, rows: r.rows.slice(0, 10), rows_total: r.rows.length }, note: `Drafted and tried on the team's data; ${next} Say what it shows in one or two sentences, citing evidence ids from the try.` }),
      isError: false,
      title: c.title,
      rows: r.rows,
      evidence: r.evidence,
      meta: r.meta as unknown as Record<string, unknown>,
      proposal: { type: "creation", id: c.id, kind, title: c.title, status: c.status, builder, detail: [String((c.spec as { description?: string }).description ?? "")] },
    };
  }
  const detail = kind === "deck_template"
    ? [String((c.spec as { description?: string }).description ?? ""), `Slides: ${slideKinds(ctx.role.id).filter((s) => [...((c.spec.rep_slides ?? c.spec.social_slides ?? c.spec.slides) as string[])].includes(s.kind)).map((s) => s.title).join(", ")}`, `${c.spec.grain === "week" ? "Weekly" : "Monthly"}`]
    : [];
  return {
    content: JSON.stringify({ status: "drafted", title: c.title, note: `Drafted; ${next} Say so in one sentence.` }),
    isError: false,
    title: c.title,
    proposal: { type: "creation", id: c.id, kind, title: c.title, status: c.status, builder, detail: detail.filter(Boolean) },
  };
}
