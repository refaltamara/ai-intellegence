/** One version of a Social Media deck: the same report shape as every deck version, so the viewer and Ask AI need nothing new. */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { saveReportFile } from "../reports/files";
import { socialPdf, socialPptx, socialSheet, socialSlideTexts, type SocialNarrative, type SocialReport } from "./deck";

const slug = (t: string) => t.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function storeSocial(o: { workspaceId: string; report: SocialReport; narrative: SocialNarrative; by: "model" | "fallback"; problems: string[]; deck: { id: string; name: string } }): Promise<{ reportId: string }> {
  const r = o.report;
  const n = o.narrative;
  const blocks = {
    kind: "deck", family: "social", deck_id: o.deck.id, grain: r.grain, title: r.title, client: r.focus.name,
    week: { iso: r.period.key, label: r.period.label, from: r.period.from, to: r.period.to }, previous_week: r.previous.label,
    headline: n.summary.headline, narrative: n, narrative_by: o.by, narrative_problems: o.problems.slice(0, 10),
    data_as_of: r.as_of, slides: socialSlideTexts(r, n), sheet: socialSheet(r),
  };
  const body = [`# ${n.summary.headline}`, "", `**What worked.** ${n.summary.worked}`, "", `**What did not.** ${n.summary.didnt}`, "", `**What to post next.** ${n.summary.next}`].join("\n");
  const rows = (await sql.query(
    "insert into reports (workspace_id, title, source, agent_run_id, deck_id, body_md, blocks) values ($1, $2, 'deck', null, $3, $4, $5::jsonb) returning id",
    [o.workspaceId, `${o.deck.name} · ${r.period.label}`, o.deck.id, body, toJson(blocks)],
  )) as { id: string }[];
  const reportId = rows[0].id;
  const base = `${slug(o.deck.name) || "Deck"}_${r.period.key}`;
  await saveReportFile({ workspaceId: o.workspaceId, reportId, format: "pptx", filename: `${base}.pptx`, data: await socialPptx(r, n) });
  await saveReportFile({ workspaceId: o.workspaceId, reportId, format: "pdf", filename: `${base}.pdf`, data: await socialPdf(r, n) });
  return { reportId };
}
