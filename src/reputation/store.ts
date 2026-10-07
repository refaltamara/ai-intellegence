/**
 * One version of a PR deck (DECISIONS, 3 Oct 2026): a report row with the blocks the
 * Decks viewer and Ask AI read (period, slide texts, fact sheet) and its .pptx and
 * .pdf, the same shape as a competitor deck version so the viewer needs nothing new.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { saveReportFile } from "../reports/files";
import { repPdf, repPptx, repSheet, repSlideTexts, type RepNarrative, type ReputationReport } from "./deck";

export type RepBlocks = {
  kind: "deck";
  family: "reputation";
  deck_id: string;
  grain: "day" | "week" | "month";
  title: string;
  client: string;
  week: { iso: string; label: string; from: string; to: string };
  previous_week: string;
  status: string;
  headline: string;
  narrative: RepNarrative;
  narrative_by: "model" | "fallback";
  narrative_problems: string[];
  data_as_of: string;
  slides: ReturnType<typeof repSlideTexts>;
  sheet: string;
};

const slug = (t: string) => t.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function storeReputation(o: { workspaceId: string; report: ReputationReport; narrative: RepNarrative; by: "model" | "fallback"; problems: string[]; deck: { id: string; name: string } }): Promise<{ reportId: string }> {
  const r = o.report;
  const n = o.narrative;
  const blocks: RepBlocks = {
    kind: "deck", family: "reputation", deck_id: o.deck.id, grain: r.grain, title: r.title, client: r.focus.name,
    week: { iso: r.period.key, label: r.period.label, from: r.period.from, to: r.period.to }, previous_week: r.previous.label,
    status: r.status.level, headline: n.summary.headline, narrative: n, narrative_by: o.by, narrative_problems: o.problems.slice(0, 10),
    data_as_of: r.as_of, slides: repSlideTexts(r, n), sheet: repSheet(r),
  };
  const body = [`# ${n.summary.headline}`, "", `**What happened.** ${n.summary.happened}`, "", `**What it means.** ${n.summary.means}`, "", `**What to do next.** ${n.summary.next}`].join("\n");
  const rows = (await sql.query(
    "insert into reports (workspace_id, title, source, agent_run_id, deck_id, body_md, blocks) values ($1, $2, 'deck', null, $3, $4, $5::jsonb) returning id",
    [o.workspaceId, `${o.deck.name} · ${r.period.label}`, o.deck.id, body, toJson(blocks)],
  )) as { id: string }[];
  const reportId = rows[0].id;
  const base = `${slug(o.deck.name) || "Deck"}_${r.period.key.replace("..", "_to_")}`;
  await saveReportFile({ workspaceId: o.workspaceId, reportId, format: "pptx", filename: `${base}.pptx`, data: await repPptx(r, n) });
  await saveReportFile({ workspaceId: o.workspaceId, reportId, format: "pdf", filename: `${base}.pdf`, data: await repPdf(r, n) });
  return { reportId };
}
