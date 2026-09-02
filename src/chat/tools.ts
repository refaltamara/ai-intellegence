/**
 * The three tools exposed to the model (PRD §5.2). run_skill's enum and
 * description are generated from skills.registry.json at boot (CLAUDE.md rule 2).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describeSkillsForTool, skillNames } from "../skills/registry";
import { ENTITIES, FILTERS, GROUP_BY, METRICS } from "../query/builder";
import { unionSkillParamsSchema } from "./schema";

/** Strict-compatible schema for query_metrics filters: one property per whitelisted filter. */
const FILTER_SCHEMA = {
  type: "object",
  properties: {
    brand_id: { type: "array", items: { type: "string" }, description: "brand slugs, handles or names" },
    platform: { type: "array", items: { type: "string", enum: ["tiktok", "instagram"] } },
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
  },
  required: [],
  additionalProperties: false,
} as const;

export function buildTools(): Anthropic.Tool[] {
  const runSkill: Anthropic.Tool = {
    name: "run_skill",
    description:
      "Run one of Fair Intel's named analyses (skills) on the workspace's social listening database. Use this whenever the user's question maps to a skill, and always when they type a /slash command. Skills return real rows computed in the database plus an evidence list; you must cite evidence ids when you use their numbers. Params marked * are required; =value shows the default.\n" +
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
      `Query aggregated metrics from the social listening database when no skill fits. Choose an entity, filters, group_by dimensions, and metrics; the server builds and runs safe SQL and returns up to 200 rows with evidence refs. Use run_skill first when a skill exists. Entities: ${ENTITIES.join(", ")}. Filters: ${Object.keys(FILTERS).join(", ")} (dates as ISO YYYY-MM-DD; brand_id accepts a slug or a list). Metrics: ${METRICS.join(", ")}. Group_by: ${GROUP_BY.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: [...ENTITIES] },
        filters: FILTER_SCHEMA,
        group_by: { type: "array", items: { type: "string", enum: [...GROUP_BY] } },
        metrics: { type: "array", items: { type: "string", enum: [...METRICS] } },
        order_by: { type: "string", description: "metric or dimension name, optionally followed by ' desc' or ' asc'" },
        limit: { type: "integer", description: "at most 200" },
      },
      required: ["entity", "metrics"],
      additionalProperties: false,
    },
    strict: true,
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

  return [runSkill, queryMetrics, createAgentDraft];
}
