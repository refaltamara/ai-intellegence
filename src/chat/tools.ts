/**
 * The five tools exposed to the model (PRD §5.2, PRD-v2 §5.2, §13.2). run_skill's enum and
 * description are generated from skills.registry.json at boot (CLAUDE.md rule 2).
 * ask_user asks the one clarifying question; export_run hands out a spreadsheet;
 * follow-ups ride in the answer text.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describeSkillsForTool, skillNames } from "../skills/registry";
import { COMMENT_GROUP_BY, COMMENT_METRICS, ENTITIES, FILTERS, GROUP_BY, METRICS } from "../query/builder";
import { EVENTS, HOOKS, OFFERS } from "../captions/prompt";
import { unionSkillParamsSchema } from "./schema";
import type { RecipeSpec } from "../recipes/spec";

/** Strict-compatible schema for query_metrics filters: one property per whitelisted filter. */
export const FILTER_SCHEMA = {
  type: "object",
  properties: {
    brand_id: { type: "array", items: { type: "string" }, description: "brand slugs, handles or names" },
    platform: { type: "array", items: { type: "string", enum: ["tiktok", "instagram", "threads", "x", "youtube"] } },
    source: { type: "string", enum: ["owned", "earned"] },
    tier: { type: "array", items: { type: "string", enum: ["nano", "micro", "mid", "macro", "mega"] } },
    has_cart: { type: "boolean" },
    content_format: { type: "array", items: { type: "string" } },
    product_category: { type: "array", items: { type: "string" } },
    universe: { type: "string" },
    creator_handle: { type: "array", items: { type: "string" } },
    date_from: { type: "string", format: "date" },
    date_to: { type: "string", format: "date" },
    min_views: { type: "integer" },
    min_followers: { type: "integer" },
    earned_only: { type: "boolean" },
    // read from captions by the model (posts with 10K+ views and brand accounts)
    caption_event: { type: "array", items: { type: "string", enum: [...EVENTS] } },
    caption_offer: { type: "array", items: { type: "string", enum: [...OFFERS] } },
    caption_hook: { type: "array", items: { type: "string", enum: [...HOOKS] } },
    caption_product: { type: "array", items: { type: "string" }, description: "product names as written, matched loosely" },
    captions_read: { type: "boolean", description: "only posts whose caption was read" },
    // comments entity only
    sentiment: { type: "array", items: { type: "string", enum: ["positive", "neutral", "negative"] }, description: "comments only" },
    topic: { type: "array", items: { type: "string" }, description: "topic labels, matched loosely (comments; posts too where the workspace labels them)" },
    stance: { type: "array", items: { type: "string", enum: ["positive", "neutral", "negative"] }, description: "posts only: what an earned post says about the subject (profile workspaces)" },
    voice: { type: "array", items: { type: "string" }, description: "the community the author speaks as, e.g. Malaysian, Indonesian, unclear (where the workspace labels it)" },
    purchase_intent: { type: "boolean", description: "comments only: comments that want to buy or sign up" },
    min_likes: { type: "integer", description: "comments only" },
  },
  required: [],
  additionalProperties: false,
} as const;

/** The one clarifying question, rendered as tappable options; the answer arrives as the next user turn. */
export const ASK_USER: Anthropic.Tool = {
  name: "ask_user",
  description:
    "Ask the person exactly one clarifying question before running an analysis, only when the answer would materially change the result and they have not already said. Give 2 to 4 short options. Never more than one question per turn. Never for cosmetic choices. After calling this, stop and wait; their next message is the answer.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "One sentence, in the person's language" },
      options: {
        type: "array",
        description: "2 to 4 options; label is what they see, value is what you receive",
        items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"], additionalProperties: false },
      },
      why: { type: "string", description: "One short clause shown in grey under the question, e.g. 'competitor overlap changes who ranks first'" },
    },
    required: ["question", "options", "why"],
    additionalProperties: false,
  },
  // strict mode rejects minItems/maxItems; the 2–4 range is enforced server-side
  strict: false,
} as Anthropic.Tool;

/** The spreadsheet on request (PRD-v2 §13.2): tiny on purpose; the server applies the pane's state. */
export const EXPORT_RUN: Anthropic.Tool = {
  name: "export_run",
  description:
    "Hand the person a spreadsheet of an analysis in this conversation when they ask for a spreadsheet, CSV, Excel, a download, or 'send me the list'. Defaults to the most recent table in this conversation and to Excel. Returns the file's details; reply with one sentence, the UI renders the download.",
  input_schema: {
    type: "object",
    properties: {
      skill_run_id: { type: "string", description: "The run_id of the analysis to export; omit for the most recent table" },
      format: { type: "string", enum: ["csv", "xlsx"], description: "Default xlsx" },
    },
    required: [],
    additionalProperties: false,
  },
  strict: false,
} as Anthropic.Tool;

/**
 * run_recipe: the analyses this team's role offers as recipes (src/recipes/), listed by
 * key with their plain description and inputs. Only present when the role has some.
 */
export function recipeTool(recipes: RecipeSpec[]): Anthropic.Tool {
  return {
    name: "run_recipe",
    description:
      "Run one of this team's ready-made analyses. Each returns rows counted in the database with evidence ids you must cite. Prefer one of these when it answers the question exactly; the person never sees these names, never repeat them.\n" +
      recipes.map((r) => `- ${r.key}: ${r.description} Inputs: ${r.params.join(", ") || "none"}.`).join("\n") +
      "\nInputs: brand (slug, handle or name; defaults to the client brand), window ({last_n_days} or {from,to} ISO dates, counting back from the newest data), platform (list), topic (list of topic labels).",
    input_schema: {
      type: "object",
      properties: {
        recipe: { type: "string", enum: recipes.map((r) => r.key) },
        params: {
          type: "object",
          properties: {
            brand: { type: "array", items: { type: "string" } },
            window: { type: "object", properties: { last_n_days: { type: "integer" }, from: { type: "string" }, to: { type: "string" } }, additionalProperties: false },
            platform: { type: "array", items: { type: "string" } },
            topic: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
      },
      required: ["recipe", "params"],
      additionalProperties: false,
    },
    strict: false,
  } as Anthropic.Tool;
}

/** a client's live extensions (src/extensions/) as query dimensions and filters, named ext_<key> */
export type ExtDim = { key: string; name: string; target: string; values: string[] };

export function buildTools(recipes: RecipeSpec[] = [], ext: ExtDim[] = []): Anthropic.Tool[] {
  const extNames = ext.map((e) => `ext_${e.key}`);
  const filterSchema = ext.length
    ? { ...FILTER_SCHEMA, properties: { ...FILTER_SCHEMA.properties, ...Object.fromEntries(ext.map((e) => [`ext_${e.key}`, { type: "array", items: { type: "string", enum: [...e.values, "none"] }, description: `the team's own ${e.name} (on ${e.target}s)` }])) } }
    : FILTER_SCHEMA;
  const runSkill: Anthropic.Tool = {
    name: "run_skill",
    description:
      "Run one of the analyses on this workspace's social listening database. Use this whenever the person's question maps to an analysis. Each returns real rows computed in the database plus an evidence list; you must cite evidence ids when you use their numbers. The person never sees these names: never repeat them. Params marked * are required; =value shows the default.\n" +
      "Available skills and their parameters:\n" +
      describeSkillsForTool() +
      "\nWindows: {last_n_days} or {from,to} ISO dates; relative windows count back from the newest data. Brands accept slugs, handles or display names. If a skill returns status 'unavailable', tell the user which data layer is not loaded yet and offer the nearest available skill.",
    input_schema: {
      type: "object",
      properties: {
        skill: { type: "string", enum: skillNames() },
        params: { ...unionSkillParamsSchema(), description: "Parameters for the chosen skill, per the list above; only pass the ones that skill defines. Use {} for defaults." },
      },
      required: ["skill", "params"],
      additionalProperties: false,
    },
    // Not strict: strict mode caps optional parameters at 24 across all tools and the
    // union of skill parameters is far larger. Inputs are validated server-side against
    // each skill's own schema and errors are returned to the model (PRD §5.2).
    strict: false,
  } as Anthropic.Tool;

  const queryMetrics: Anthropic.Tool = {
    name: "query_metrics",
    description:
      `Query aggregated metrics from the social listening database when no skill fits. Choose an entity, filters, group_by dimensions, and metrics; the server builds and runs safe SQL and returns up to 200 rows with evidence refs. Use run_skill first when a skill exists. Entities: ${ENTITIES.join(", ")}. Filters: ${Object.keys(FILTERS).join(", ")} (dates as ISO YYYY-MM-DD; brand_id accepts a slug or a list). Metrics: ${METRICS.join(", ")}. Group_by: ${GROUP_BY.join(", ")}. The comments entity counts what people say under the posts (without the brands' own replies): filters brand_id, platform, source, date_from, date_to, sentiment, topic, voice, purchase_intent, min_likes; metrics ${COMMENT_METRICS.join(", ")}; group_by ${COMMENT_GROUP_BY.join(", ")}; defaults to the last 30 days.${ext.length ? ` The team's own data, as group_by and filters on either entity: ${ext.map((e) => `ext_${e.key} (${e.name} on ${e.target}s: ${e.values.join(", ")}; "none" when read and nothing fits, "not tagged" when not read yet)`).join("; ")}.` : ""}`,
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: [...ENTITIES] },
        filters: filterSchema,
        group_by: { type: "array", items: { type: "string", enum: [...new Set([...GROUP_BY, ...COMMENT_GROUP_BY, ...extNames])] } },
        metrics: { type: "array", items: { type: "string", enum: [...METRICS, ...COMMENT_METRICS] } },
        order_by: { type: "string", description: "metric or dimension name, optionally followed by ' desc' or ' asc'" },
        limit: { type: "integer", description: "at most 200" },
      },
      required: ["entity", "metrics"],
      additionalProperties: false,
    },
    // Not strict either: the grammar compiler rejected this schema as "too complex" and
    // strict mode adds compile latency; the builder whitelists every field server-side.
    strict: false,
  } as Anthropic.Tool;

  const createAgentDraft: Anthropic.Tool = {
    name: "create_agent_draft",
    description:
      "Propose a recurring agent when the user asks for something on a schedule ('every week', 'each Monday', 'alert me when'). Do not create it; return a draft the UI shows for editing. Base the draft on the most recent skill run in this conversation when there is one, carrying over all its parameters exactly. Default schedule when not stated: weekly, Monday 07:00 Asia/Jakarta (cron '0 7 * * 1').",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        skill: { type: "string", enum: skillNames() },
        params: { ...unionSkillParamsSchema(), description: "The skill's parameters, carried over unchanged from the most recent run when there is one" },
        schedule: {
          type: "object",
          properties: { cron: { type: "string" }, tz: { type: "string" }, human: { type: "string" } },
          required: ["cron", "tz", "human"],
          additionalProperties: false,
        },
        delivery: {
          type: "object",
          properties: { channels: { type: "array", items: { type: "string", enum: ["email", "whatsapp", "in_app"] } } },
          required: ["channels"],
          additionalProperties: false,
        },
        only_if_changed: { type: "boolean" },
        from_skill_run_id: { type: "string" },
      },
      required: ["name", "skill", "params", "schedule", "delivery", "only_if_changed"],
      additionalProperties: false,
    },
    strict: false, // same reason as run_skill; validated by agentFromBody
  } as Anthropic.Tool;

  return [runSkill, ...(recipes.length ? [recipeTool(recipes)] : []), queryMetrics, createAgentDraft, ASK_USER, EXPORT_RUN];
}
