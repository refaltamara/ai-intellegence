/**
 * Labels made before labels kept their author (DECISIONS, 10 Oct 2026): each judgment already on a post or comment gets
 * its row, attributed to what is known about where it came from, version 'before 10 Oct 2026':
 *   vendor:fair-listening   what a listening dump brought: sentiment, theme, purchase intent, translation, topic
 *   model                   what our labeller and caption reading wrote: sentiment, off-topic, topic, voice, stance, set-aside posts, caption tags
 *   rule:terms              a listening post's relevance, judged by its brand's terms at load
 * Safe to run again: a judgment that already has its row is skipped.
 */
import { sql } from "../db/client";
import { labellerId } from "./record";

export const BEFORE = "before 10 Oct 2026";

type Step = { name: string; labeller: string; sql: string };

const comment = (kind: string, value: string, where: string, at = "c.classified_at", conf = "c.sentiment_confidence") => `
  insert into labels (workspace_id, target, target_id, kind, value, confidence, labeller_id, labelled_at)
  select c.workspace_id, 'comment', c.id, '${kind}', ${value}, ${conf}::real, $1, coalesce(${at}, now())
    from comments c
   where ${where} and ${value} is not null
     and not exists (select 1 from labels l where l.target = 'comment' and l.target_id = c.id and l.kind = '${kind}' and l.labeller_id = $1)`;
const post = (kind: string, value: string, where: string, at = "now()", conf = "null") => `
  insert into labels (workspace_id, target, target_id, kind, value, confidence, labeller_id, labelled_at)
  select p.workspace_id, 'post', p.id, '${kind}', ${value}, ${conf}::real, $1, ${at}
    from posts p
   where ${where} and ${value} is not null
     and not exists (select 1 from labels l where l.target = 'post' and l.target_id = p.id and l.kind = '${kind}' and l.labeller_id = $1)`;

const STEPS: Step[] = [
  { name: "vendor sentiment", labeller: "vendor:fair-listening", sql: comment("sentiment", "c.sentiment", "c.sentiment_source = 'listening'") },
  { name: "vendor theme", labeller: "vendor:fair-listening", sql: comment("theme", "c.theme", "true") },
  { name: "vendor intent", labeller: "vendor:fair-listening", sql: comment("intent", "case when c.purchase_intent then 'yes' when not c.purchase_intent then 'no' end", "true") },
  { name: "vendor translation", labeller: "vendor:fair-listening", sql: comment("translation", "c.translation", "true", "c.classified_at", "null") },
  { name: "vendor topic", labeller: "vendor:fair-listening", sql: comment("topic", "c.topic_id", "coalesce(c.sentiment_source, '') not like 'model%'") },
  { name: "model sentiment", labeller: "model", sql: comment("sentiment", "c.sentiment", "c.sentiment_source = 'model' and c.off_topic is not true") },
  { name: "model off-topic", labeller: "model", sql: comment("off_topic", "case when c.off_topic then 'yes' when not c.off_topic then 'no' end", "c.sentiment_source = 'model'") },
  { name: "model comment topic", labeller: "model", sql: comment("topic", "c.topic_id", "c.sentiment_source like 'model%'", "c.classified_at", "c.topic_confidence") },
  { name: "model comment voice", labeller: "model", sql: comment("voice", "c.voice", "c.sentiment_source like 'model%'", "c.classified_at", "null") },
  { name: "model stance", labeller: "model", sql: post("stance", "p.stance", "p.stance_source = 'model'") },
  { name: "model set aside", labeller: "model", sql: post("relevant", "case when p.relevant = false then 'no' end", "p.stance_source = 'model'") },
  { name: "model post topic", labeller: "model", sql: post("topic", "p.topic_id", "p.stance_source = 'model'", "now()", "p.topic_confidence") },
  { name: "model post voice", labeller: "model", sql: post("voice", "p.voice", "p.stance_source = 'model'") },
  { name: "terms relevance", labeller: "rule:terms", sql: post("relevant", "case when p.relevant then 'yes' when not p.relevant then 'no' end", "p.workspace_id in (select id from workspaces where kind = 'category')") },
  ...(["product", "event", "event_name", "offer", "hook", "angle"] as const).map((k): Step => ({
    name: `model caption ${k}`, labeller: "model", sql: post(`caption_${k}`, `p.cap_${k}`, "p.cap_source = 'model'", "coalesce(p.cap_read_at, now())"),
  })),
];

export async function backfillLabels(log: (s: string) => void = () => {}): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const s of STEPS) {
    const id = await labellerId(s.labeller, BEFORE);
    const r = (await sql.query(`with i as (${s.sql} returning 1) select count(*)::int as n from i`, [id])) as { n: number }[];
    out[s.name] = r[0].n;
    log(`${s.name}: ${r[0].n}`);
  }
  return out;
}
