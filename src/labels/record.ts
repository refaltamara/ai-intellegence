/**
 * Recording judgments with their author (labels, labellers; DECISIONS, 10 Oct 2026, "Judgments keep their author").
 * Whoever writes a label onto a post or comment also adds its row here: the labeller (src/label/run.ts), caption reading
 * (src/captions/run.ts), the loader for labels a vendor sends (src/loader/promote.ts), relevance rules (src/onboard/terms.ts).
 */
import { createHash } from "node:crypto";
import { sql } from "../db/client";
import { toJson } from "../db/json";

export type LabelRow = { target: "post" | "comment"; target_id: string; kind: string; value: string | null; confidence?: number | null };

/** what instructions a model ran with: a short fingerprint of its system prompt, so a label says which version made it */
export const promptVersion = (text: string) => `p:${createHash("sha1").update(text).digest("hex").slice(0, 10)}`;

/** which version of a rule decided: a short fingerprint of what it ran with (a brand's terms, never-phrases and handles) */
export const ruleVersion = (what: unknown) => `r:${createHash("sha1").update(JSON.stringify(what)).digest("hex").slice(0, 10)}`;

/** the labeller as a person or a rule names it: whatever the model is called in this deployment */
export const modelLabeller = (model: string) => `model:${model}`;

const ids = new Map<string, number>();
export async function labellerId(name: string, version = ""): Promise<number> {
  const key = `${name}\u0001${version}`;
  const hit = ids.get(key);
  if (hit) return hit;
  const r = (await sql.query(
    `with i as (insert into labellers (name, version) values ($1, $2) on conflict (name, version) do nothing returning id)
     select id from i union all select id from labellers where name = $1 and version = $2 limit 1`,
    [name, version],
  )) as { id: number }[];
  ids.set(key, r[0].id);
  return r[0].id;
}

/** add judgments; a value of null is skipped (no judgment made) */
export async function recordLabels(ws: string, labeller: string, version: string, rows: LabelRow[]): Promise<number> {
  const keep = rows.filter((r) => r.value != null && r.value !== "");
  if (!keep.length) return 0;
  const id = await labellerId(labeller, version);
  for (let i = 0; i < keep.length; i += 2000) {
    await sql.query(
      `insert into labels (workspace_id, target, target_id, kind, value, confidence, labeller_id)
       select $2, r.target, r.target_id, r.kind, r.value, r.confidence, $3 from jsonb_to_recordset($1::jsonb) as r(target text, target_id uuid, kind text, value text, confidence real)`,
      [toJson(keep.slice(i, i + 2000).map((r) => ({ ...r, confidence: r.confidence ?? null }))), ws, id],
    );
  }
  return keep.length;
}

/** the labeller's comment labels as rows: off-topic is its own judgment; a sentiment only when the comment is on topic */
export function commentLabelRows(l: { id: string; sentiment: string; confidence: number | null; topic?: string | null; voice?: string | null }): LabelRow[] {
  const off = l.sentiment === "off_topic";
  return [
    { target: "comment", target_id: l.id, kind: "off_topic", value: off ? "yes" : "no", confidence: l.confidence },
    { target: "comment", target_id: l.id, kind: "sentiment", value: off ? null : l.sentiment, confidence: l.confidence },
    { target: "comment", target_id: l.id, kind: "topic", value: l.topic ?? null, confidence: l.confidence },
    { target: "comment", target_id: l.id, kind: "voice", value: l.voice ?? null },
  ];
}

/** the labeller's post labels: a stance, or set aside as not about the subject or the case */
export function postLabelRows(l: { id: string; sentiment: string; confidence: number | null; topic?: string | null; voice?: string | null }): LabelRow[] {
  const off = l.sentiment === "off_topic";
  return [
    { target: "post", target_id: l.id, kind: "stance", value: off ? null : l.sentiment, confidence: l.confidence },
    { target: "post", target_id: l.id, kind: "relevant", value: off ? "no" : null, confidence: l.confidence },
    { target: "post", target_id: l.id, kind: "topic", value: l.topic ?? null, confidence: l.confidence },
    { target: "post", target_id: l.id, kind: "voice", value: l.voice ?? null },
  ];
}
