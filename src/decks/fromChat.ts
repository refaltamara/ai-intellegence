/**
 * Decks from Chats (DECISIONS, 2 Oct 2026). "Turn into a deck" keeps every
 * analysis CeMO ran in the conversation as a finding: the skill and the settings
 * it ran with, and the question that led to it. Each version of the deck runs
 * them again over its period, next to a scoreboard and the moves for the brands
 * the conversation was about. "Add to a deck" in the pane pins one analysis into
 * an existing deck, or starts a deck from it.
 */
import type { SlideKind } from "../competitor/slides";
import { getConversation, listMessages, type ToolCallRecord } from "../chat/persist";
import { sql } from "../db/client";
import { getSkill } from "../skills/registry";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { brandLabel, type DeckSpec, type FindingSpec } from "./spec";

const MAX_FINDINGS = 6;
const CHAT_SLIDES: SlideKind[] = ["summary", "findings", "scoreboard", "trend", "moves", "evidence"];

const titleOf = (skill: string, fallback?: string | null) => fallback?.trim() || getSkill(skill)?.title || skill.replace(/-/g, " ");

/** One analysis from Chats, by its run. */
export async function findingFromRun(runId: string, workspaceId: string, question = ""): Promise<FindingSpec | null> {
  if (!/^[0-9a-f-]{36}$/.test(runId)) return null;
  const r = (await sql.query("select skill, params, pane_title from skill_runs where id = $1 and workspace_id = $2", [runId, workspaceId])) as { skill: string; params: Record<string, unknown>; pane_title: string | null }[];
  const run = r[0];
  if (!run || !getSkill(run.skill)) return null;
  return { key: "f1", skill: run.skill, params: run.params ?? {}, question: question || titleOf(run.skill, run.pane_title), title: titleOf(run.skill, run.pane_title) };
}

/** Every analysis that answered in the conversation, in order, with the question that led to it; the same analysis with the same settings once. */
export async function conversationFindings(conversationId: string, workspaceId: string, userId: string | null): Promise<{ title: string; findings: FindingSpec[] } | null> {
  const conv = await getConversation(conversationId, workspaceId, userId);
  if (!conv) return null;
  const messages = await listMessages(conv.id);
  const out: FindingSpec[] = [];
  const seen = new Set<string>();
  let question = "";
  for (const m of messages) {
    const c = m.content_json ?? { text: "" };
    if (m.role === "user") {
      if (!c.hidden) question = String(c.text ?? "").trim();
      continue;
    }
    for (const t of (c.tools ?? []) as ToolCallRecord[]) {
      if (t.name !== "run_skill" || t.status !== "ok" || !t.run_id || !(t.rows?.length)) continue;
      const f = await findingFromRun(t.run_id, workspaceId, question);
      if (!f) continue;
      const sig = `${f.skill}|${JSON.stringify(f.params)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ ...f, key: `f${out.length + 1}`, title: titleOf(f.skill, t.title) });
    }
  }
  const title = (conv.title ?? out[0]?.question ?? "From Chats").trim();
  return { title: title.charAt(0).toUpperCase() + title.slice(1), findings: out.slice(0, MAX_FINDINGS) };
}

/** The brands a set of findings is about: those named in their settings, else the panel's biggest brands of the last 30 days of data. */
export async function findingBrands(findings: FindingSpec[], workspaceId: string): Promise<DeckSpec["watchlist"]> {
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const name = new Map(ctx.brands.map((b) => [b.id, brandLabel(b.name)]));
  const named = [...new Set(findings.flatMap((f) => (Array.isArray(f.params.brands) ? f.params.brands : [f.params.brand]).filter((b): b is string => typeof b === "string" && name.has(b))))];
  let ids = named.filter((id) => id !== ctx.clientBrandId).slice(0, 8);
  if (!ids.length) {
    const top = (await sql.query(
      `select brand_id, sum(views) as v from posts where workspace_id = $1 and posted_at >= ($2::date - 29) and brand_id is not null and brand_id <> coalesce($3, '')
       group by 1 order by 2 desc nulls last limit 6`,
      [workspaceId, ctx.asOf, ctx.clientBrandId],
    )) as { brand_id: string }[];
    ids = top.map((t) => t.brand_id).filter((id) => name.has(id));
  }
  return ids.map((id) => ({ name: name.get(id)!, group: "core" as const, brand_ids: [id] }));
}

/** A deck spec around findings from Chats. */
export async function chatDeckSpec(title: string, findings: FindingSpec[], workspaceId: string): Promise<DeckSpec | { error: string }> {
  if (!findings.length) return { error: "Nothing to put in a deck yet: ask a question CeMO answers with an analysis first." };
  const watchlist = await findingBrands(findings, workspaceId);
  if (!watchlist.length) return { error: "No brands to build the deck on." };
  return { title: title.slice(0, 60), grain: "week", platforms: [], client: null, watchlist, slides: CHAT_SLIDES, findings };
}
