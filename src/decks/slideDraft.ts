/**
 * "Describe your own slide" (DECISIONS, 7 Oct 2026, "Teams build their own"): a person writes
 * what they want on a slide ("comments that mention halal, per day"); CeMO turns it into one
 * analysis over the whitelisted query builder (a recipe), it is checked, tried on the newest
 * week of data and shown before anyone keeps it. CeMO only names the query: the numbers are
 * counted in SQL when the slide is drawn, for each version's own dates. Saved, it is a team
 * skill (a creation): live for a Builder, the maker's own until a Builder approves a Member's.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Actor } from "../auth/can";
import { anthropicClient, describeModelError, toolAnswer } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { FILTER_SCHEMA } from "../chat/tools";
import { CREDIT_PRICES } from "../config/credits";
import { canSpend, charge } from "../credits/ledger";
import { COMMENT_GROUP_BY, COMMENT_METRICS, GROUP_BY, METRICS } from "../query/builder";
import { runRecipe } from "../recipes/run";
import { ROLE_VIEWS } from "../definitions/catalog";
import { validateRecipe, type RecipeSpec } from "../recipes/spec";
import type { RoleId } from "../roles/model";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { getWorkspace } from "../workspace/store";
import { by, signal } from "../learning/signals";
import { isBuilder, makeCreation } from "../company/creations";
import type { FindingColumn } from "../competitor/types";
import { findingColumns } from "./findings";
import { teamLine, teamShape, type TeamShape } from "./teamSlide";
import { panelPlatformsSql } from "../db/panel";

export type SlidePreview = { status: "ok" | "empty" | "error"; message?: string; columns: FindingColumn[]; rows: Record<string, unknown>[]; rows_total: number; shape: TeamShape; line: string | null; window: { from: string; to: string } };
export type SlideDraft = { recipe: RecipeSpec; preview: SlidePreview };

const DRAFT_TOOL: Anthropic.Tool = {
  name: "draft_slide",
  description: "One analysis for one slide: what to count, how to group it and which rows count.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "the slide's title, plain, up to 60 characters (\"Comments mentioning halal\")" },
      description: { type: "string", description: "one line: what the slide answers" },
      query: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["comments", "posts"], description: "comments: what people say under the posts; posts: the posts themselves" },
          metrics: { type: "array", items: { type: "string", enum: [...new Set([...COMMENT_METRICS, ...METRICS])] } },
          group_by: { type: "array", items: { type: "string", enum: [...new Set([...COMMENT_GROUP_BY, ...GROUP_BY])] }, description: "day, week or month for a slide over time; add one more (sentiment, stance, voice, topic) to split each bar" },
          filters: FILTER_SCHEMA,
          order_by: { type: "string" },
          limit: { type: "integer" },
        },
        required: ["entity", "metrics"],
        additionalProperties: false,
      },
    },
    required: ["title", "description", "query"],
    additionalProperties: false,
  },
};

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "slide";

async function brief(ws: string): Promise<string> {
  const db = new SkillDb();
  const ctx = await loadContext(db, ws);
  const cfg = await getWorkspace(ws);
  const topics = await db.q<{ label: string }>("select label from topics where workspace_id = $1 order by sort_order, label limit 30", [ws]).catch(() => []);
  const platforms = await db.q<{ platform: string }>(panelPlatformsSql("$1"), [ws]);
  const label = ((await db.q<{ label: { voices?: string[] } | null }>("select settings->'label' as label from workspaces where id = $1", [ws]))[0]?.label) ?? null;
  return [
    `Workspace: ${cfg?.name ?? ws}; brands: ${ctx.brands.slice(0, 20).map((b) => `${b.name} (${b.id})`).join(", ")}${ctx.clientBrandId ? `; the team's own brand is ${ctx.clientBrandId}` : ""}.`,
    `Platforms: ${platforms.map((p) => p.platform).join(", ")}. Data runs ${ctx.earliest.slice(0, 10)} to ${ctx.asOf}.`,
    topics.length ? `Topics comments and posts are labelled with: ${topics.map((t) => t.label).join(", ")}.` : "",
    label?.voices?.length ? `Voices (the side an author writes from): ${label.voices.join(", ")}.` : "",
  ].filter(Boolean).join("\n");
}

const SYSTEM = [
  "You turn what a person wants on a slide into one analysis over the team's social listening data. Call draft_slide once.",
  "Use comments for what people say, posts for the posts themselves. For a slide over time, group by day (or week or month for a long period); add one more group (sentiment, stance, voice or topic) only when they ask to split it.",
  "To count posts or comments that name a word, a brand or a person, use the mentions filter with the words as people write them (both languages when it helps, e.g. boikot, boycott).",
  "Never set date filters: each deck version sets its own dates. Keep the limit at 60 or less. Pick metrics that answer the sentence and nothing else.",
].join("\n");

/** CeMO drafts the analysis; it is checked (one more try when it does not check out) and tried on the newest week. */
export async function draftSlide(ws: string, role: RoleId, text: string, actor: Actor, source: "form" | "chat" | "comment" = "form"): Promise<{ ok: true; draft: SlideDraft } | { ok: false; error: string }> {
  const ask = text.trim().slice(0, 400);
  if (ask.length < 6) return { ok: false, error: "Say in a sentence what the slide should show." };
  if (!hasModelCredentials()) return { ok: false, error: "CeMO is not available on this server." };
  const spend = await canSpend(ws, CREDIT_PRICES.creation);
  if (!spend.ok) return { ok: false, error: spend.message };
  const client = anthropicClient({ workspace: ws, purpose: "slide_draft" });
  const call = (req: Anthropic.MessageCreateParamsNonStreaming) => client.messages.create(req);
  const base = { model: modelId(), max_tokens: 4000, system: SYSTEM, tools: [DRAFT_TOOL] };
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: `${await brief(ws)}\n\nThe slide they want: ${ask}` }];
  let recipe: RecipeSpec | null = null;
  let errors: string[] = [];
  try {
    for (let attempt = 0; attempt < 2 && !recipe; attempt++) {
      const { use, messages: sent, res } = await toolAnswer(call, { ...base, messages }, DRAFT_TOOL.name);
      const d = (use?.input ?? {}) as { title?: string; description?: string; query?: RecipeSpec["query"] };
      const title = String(d.title ?? "").trim().slice(0, 60) || ask.slice(0, 60);
      const r: RecipeSpec = {
        key: `s-${slug(title)}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        description: String(d.description ?? ask).trim().slice(0, 240) || ask.slice(0, 240),
        activity: "Counting {{days}} days for the slide",
        examples: [ask.slice(0, 200)],
        roles: [role],
        query: { ...(d.query ?? { entity: "comments", metrics: ["count_comments"] }), limit: Math.min(60, Number(d.query?.limit ?? 60) || 60) },
        params: ["window"],
        present: "chart",
      };
      errors = validateRecipe(r);
      if (!errors.length) { recipe = r; break; }
      if (!use) break;
      messages = [...sent, { role: "assistant", content: res.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: `That does not check out: ${errors.join(" ")} Call draft_slide again, fixed.`, is_error: true }] }];
    }
  } catch (e) {
    return { ok: false, error: `CeMO could not draft it: ${describeModelError(e).slice(0, 200)}` };
  }
  if (!recipe) return { ok: false, error: `CeMO's draft did not check out: ${errors.join(" ") || "no draft came back"}` };
  const ctx = await loadContext(new SkillDb(), ws);
  const from = new Date(ctx.asOf + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - 6);
  const window = { from: from.toISOString().slice(0, 10), to: ctx.asOf };
  const res = await runRecipe(recipe, { window }, ws, { views: ROLE_VIEWS[role] });
  if (res.status === "error") return { ok: false, error: `The draft did not run: ${res.message ?? "unknown error"}` };
  const rows = res.rows.map(({ evidence_ids: _e, ...r }) => r);
  const columns = findingColumns(rows);
  const f = { columns, rows, status: rows.length ? ("ok" as const) : ("empty" as const) };
  await charge({ ws, email: actor.email, staff: actor.staff.length > 0, kind: "creation", credits: CREDIT_PRICES.creation, ref: recipe.key, note: `Slide: ${recipe.title}` });
  await signal(by(actor, ws, role), "deck.slide_drafted", { from: source, status: f.status });
  return {
    ok: true,
    draft: {
      recipe,
      preview: { status: f.status, ...(rows.length ? {} : { message: `Nothing matched between ${window.from} and ${window.to}; it may still fill on other dates.` }), columns, rows: rows.slice(0, 40), rows_total: rows.length, shape: teamShape({ columns, rows }), line: rows.length ? teamLine({ key: "p", title: recipe.title, question: ask, status: "ok", columns, rows, rows_total: rows.length, data_window: window }) ?? null : null, window },
    },
  };
}

/** Keep a drafted slide as a team skill: live for a Builder, the maker's own for a Member until a Builder approves it. */
export async function saveSlide(ws: string, role: RoleId, recipe: unknown, actor: Actor): Promise<{ ok: true; key: string; title: string; status: string; by: string } | { ok: false; error: string }> {
  const r = (recipe && typeof recipe === "object" ? recipe : {}) as RecipeSpec;
  const made = await makeCreation(actor, { ws, role, kind: "skill", input: { ...r, roles: [role] } as unknown as Record<string, unknown>, live: isBuilder(actor, ws, role) });
  if (!made.ok) return { ok: false, error: made.error };
  return { ok: true, key: made.creation.key!, title: made.creation.title, status: made.creation.status, by: made.creation.maker_name ?? made.creation.maker_email };
}
