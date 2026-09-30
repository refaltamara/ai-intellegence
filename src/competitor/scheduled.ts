/**
 * The Weekly Competitor Pulse as a scheduled report (DECISIONS, 30 Sep 2026):
 * a schedule under Reports holds the contract (who the report is for, the
 * watchlist), the formats and the recipients. Each run reports the latest week
 * the data fully covers, writes the words (src/competitor/write.ts), renders the
 * deck and its PDF from one layout, stores both with the report, and emails them.
 * A scheduled run skips a week it has already sent, so a panel that has not
 * moved on sends nothing; "Run now" always produces the report.
 */
import { appUrl } from "../config/app";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { deliver, type DeliveryOutcome } from "../delivery";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { contractGroups, type WeeklyContract } from "./contract";
import { deckBuffer } from "./deck";
import { weeklyReport } from "./facts";
import type { Narrative } from "./narrative";
import { pdfBuffer } from "./pdfdeck";
import type { WeeklyReport } from "./types";
import { addDays, isoWeek, weekStart } from "./weeks";
import { flagValue, metricLabel, PLATFORM_NAME } from "./view";
import { writeNarrative } from "./write";
import { saveReportFile, type ReportFileMeta } from "../reports/files";

export type ReportFormat = "pptx" | "pdf";
export const FORMATS: ReportFormat[] = ["pptx", "pdf"];
export type WeeklyParams = { contract: WeeklyContract; formats: ReportFormat[]; last_week?: string };

/** What the Library shows for a weekly report; the full numbers live in the files. */
export type WeeklyBlocks = {
  kind: "weekly";
  title: string;
  client: string;
  week: { iso: string; label: string; from: string; to: string };
  previous_week: string;
  summary: Narrative["summary"];
  scoreboard_title: string;
  movers_title: string;
  movers: { name: string; platform: string; measure: string; direction: "up" | "down"; value: string; previous: string; why: string }[];
  actions: Narrative["actions"];
  portfolio_note?: string;
  narrative_by: "model" | "fallback";
  narrative_problems: string[];
  data_as_of: string;
  agent_name?: string;
};

/** The Monday of the latest week the data fully covers: the week of `asOf` when it is a Sunday, else the week before. */
export function latestCompleteWeek(asOf: string): string {
  const d = new Date(asOf + "T00:00:00Z");
  const monday = addDays(asOf, -((d.getUTCDay() + 6) % 7));
  return d.getUTCDay() === 0 ? monday : addDays(monday, -7);
}

/** Shape check for a stored contract; the brand ids are checked against the workspace when the schedule is saved. */
export function validContract(c: unknown, workspaceId: string): WeeklyContract | string {
  if (!c || typeof c !== "object") return "the report needs a client and a watchlist";
  const o = c as WeeklyContract;
  const contract: WeeklyContract = { ...o, workspace: workspaceId };
  try {
    contractGroups(contract);
  } catch (e) {
    return (e as Error).message.replace(/^contract: /, "");
  }
  return contract;
}

export function blocksFor(r: WeeklyReport, n: Narrative, by: "model" | "fallback", problems: string[], agentName?: string): WeeklyBlocks {
  return {
    kind: "weekly",
    title: r.title,
    client: r.client,
    week: { iso: r.week.iso, label: r.week.label, from: r.week.from, to: r.week.to },
    previous_week: r.previous_week.label,
    summary: n.summary,
    scoreboard_title: n.scoreboard_title,
    movers_title: n.movers_title,
    movers: r.movers.map((m) => ({
      name: m.name,
      platform: PLATFORM_NAME[m.platform],
      measure: metricLabel(m.flag.metric, m.flag.unit, m.platform),
      direction: m.flag.direction,
      value: flagValue(m.flag.unit, m.flag.metric, m.flag.value),
      previous: flagValue(m.flag.unit, m.flag.metric, m.flag.previous),
      why: n.drivers.find((d) => d.key === m.key)?.why ?? "",
    })),
    actions: n.actions,
    portfolio_note: n.portfolio_note,
    narrative_by: by,
    narrative_problems: problems.slice(0, 10),
    data_as_of: r.data_as_of,
    agent_name: agentName,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email: the three-line summary, the movers and the actions, with the deck attached. */
export function weeklyEmail(b: WeeklyBlocks, link: string | null, files: string[]): { html: string; text: string } {
  const card = (s: WeeklyBlocks["summary"][number]) =>
    `<td style="vertical-align:top;padding:14px 16px;background:#EFF6FF;border-radius:12px;width:33%"><div style="font-size:12px;font-weight:700;color:#1D4ED8">${esc(s.label)}</div><div style="font-size:26px;font-weight:800;color:#0F172A;margin:4px 0 2px">${esc(s.stat)}</div><div style="font-size:12px;color:#475569;margin-bottom:8px">${esc(s.stat_label)}</div><div style="font-size:14px;color:#0F172A;line-height:1.45">${esc(s.text)}</div></td>`;
  const movers = b.movers.length
    ? b.movers.map((m) => `<li style="margin:0 0 10px"><b>${esc(m.name)}</b> · ${esc(m.platform)}: ${esc(m.measure.toLowerCase())} ${m.direction === "up" ? "▲" : "▼"} ${esc(m.value)} (last week ${esc(m.previous)}). <span style="color:#475569">${esc(m.why)}</span></li>`).join("")
    : `<li>A quiet week: no watchlist brand moved outside its own normal range.</li>`;
  const actions = b.actions.map((a, i) => `<li style="margin:0 0 10px"><b>${i + 1}. ${esc(a.title)}</b><br/><span style="color:#475569">${esc(a.detail)}</span></li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F8FAFC;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:28px">
<div style="font-size:13px;font-weight:700;color:#1D4ED8">${esc(b.title)}</div>
<div style="font-size:28px;font-weight:800;margin:4px 0">${esc(b.week.label)}</div>
<div style="font-size:14px;color:#475569;margin-bottom:18px">Prepared for ${esc(b.client)} · against ${esc(b.previous_week)}</div>
<table role="presentation" cellspacing="8" cellpadding="0" style="width:100%;margin:0 -8px 18px"><tr>${b.summary.map(card).join("")}</tr></table>
<h3 style="font-size:15px;margin:18px 0 8px">${esc(b.movers_title)}</h3><ul style="padding-left:18px;font-size:14px;line-height:1.5">${movers}</ul>
<h3 style="font-size:15px;margin:18px 0 8px">What ${esc(b.client)} should do this week</h3><ul style="padding-left:18px;font-size:14px;line-height:1.5;list-style:none">${actions}</ul>
${files.length ? `<p style="font-size:13px;color:#475569">The full deck is attached (${files.map(esc).join(", ")}).</p>` : ""}
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#1D4ED8;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 16px;border-radius:999px">Open in Fair Intelligence</a></p>` : ""}
<p style="font-size:11px;color:#94A3B8;margin-top:22px">Fair social listening panel · data through ${esc(b.data_as_of)} · every number in this report is computed from the data; the words are written from those numbers.</p>
</div></body></html>`;
  const text = [
    `${b.title} · ${b.week.label} · prepared for ${b.client}`,
    "",
    ...b.summary.map((s) => `${s.label}: ${s.stat} ${s.stat_label}. ${s.text}`),
    "",
    b.movers_title,
    ...(b.movers.length ? b.movers.map((m) => `- ${m.name} (${m.platform}): ${m.measure} ${m.direction} ${m.value} (last week ${m.previous}). ${m.why}`) : ["- A quiet week."]),
    "",
    `What ${b.client} should do`,
    ...b.actions.map((a, i) => `${i + 1}. ${a.title}: ${a.detail}`),
    ...(link ? ["", link] : []),
  ].join("\n");
  return { html, text };
}

type AgentLike = { id: string; workspace_id: string; name: string; params: Record<string, unknown>; delivery: { channels: string[]; email?: string; whatsapp?: string } };
export type WeeklyOutcome = { status: "ok" | "skipped" | "error"; message: string; report_id: string | null; week: string | null; delivered: DeliveryOutcome[]; narrative_by?: "model" | "fallback" };

/** One run of a weekly-report schedule. `week` (a Monday or YYYY-Www) picks the week; otherwise the latest complete one. */
export async function runWeekly(agent: AgentLike, runId: string, opts: { reason?: "schedule" | "manual"; week?: string } = {}): Promise<WeeklyOutcome> {
  const params = agent.params as unknown as WeeklyParams;
  const contract = validContract(params.contract, agent.workspace_id);
  if (typeof contract === "string") return { status: "error", message: `the report settings are incomplete: ${contract}`, report_id: null, week: null, delivered: [] };
  const ctx = await loadContext(new SkillDb(), agent.workspace_id);
  let monday: string;
  try {
    monday = opts.week ? weekStart(opts.week) : latestCompleteWeek(ctx.asOf);
  } catch (e) {
    return { status: "error", message: (e as Error).message, report_id: null, week: null, delivered: [] };
  }
  const iso = isoWeek(monday);
  if (opts.reason !== "manual" && params.last_week === iso) {
    return { status: "skipped", message: `no new week of data: ${iso} was already sent (data through ${ctx.asOf})`, report_id: null, week: iso, delivered: [] };
  }

  const r = await weeklyReport(contract, monday);
  const written = await writeNarrative(r);
  const formats = (params.formats?.length ? params.formats : FORMATS).filter((f): f is ReportFormat => FORMATS.includes(f as ReportFormat));
  const blocks = blocksFor(r, written.narrative, written.by, written.problems, agent.name);
  const title = `${r.title} · ${r.client} · ${r.week.label}`;
  const rows = (await sql.query(
    "insert into reports (workspace_id, title, source, agent_run_id, body_md, blocks) values ($1, $2, 'agent', $3, $4, $5::jsonb) returning id",
    [agent.workspace_id, title, runId, weeklyEmail(blocks, null, []).text, toJson(blocks)],
  )) as { id: string }[];
  const reportId = rows[0].id;

  const base = `${r.title.replace(/[^A-Za-z0-9]+/g, "-")}_${r.client.replace(/[^A-Za-z0-9]+/g, "-")}_${r.week.iso}`;
  const saved: (ReportFileMeta & { data: Buffer })[] = [];
  for (const f of formats) {
    const data = f === "pptx" ? await deckBuffer(r, written.narrative) : await pdfBuffer(r, written.narrative);
    const meta = await saveReportFile({ workspaceId: agent.workspace_id, reportId, format: f, filename: `${base}.${f}`, data });
    saved.push({ ...meta, data });
  }

  const url = appUrl();
  const link = url ? `${url}/reports/${reportId}` : null;
  const email = weeklyEmail(blocks, link, saved.map((s) => s.filename));
  const delivered = await deliver(agent.delivery, { subject: `[Fair Intelligence] ${title}`, html: email.html, text: email.text, attachments: saved.map((s) => ({ filename: s.filename, content: s.data })) });
  return { status: "ok", message: `${iso}: ${r.movers.length} mover${r.movers.length === 1 ? "" : "s"}, words by ${written.by === "model" ? "CeMO" : "the plain template"}`, report_id: reportId, week: iso, delivered, narrative_by: written.by };
}

/** Check what the Reports form sends before it becomes a schedule: a client with brands, a watchlist, known brand ids, formats. */
export async function weeklyParamsFrom(input: { contract?: unknown; formats?: unknown }, workspaceId: string, previous?: Partial<WeeklyParams>): Promise<WeeklyParams | { error: string }> {
  const contract = validContract(input.contract ?? previous?.contract, workspaceId);
  if (typeof contract === "string") return { error: contract };
  const known = new Set(((await sql.query("select id from brands where workspace_id = $1", [workspaceId])) as { id: string }[]).map((b) => b.id));
  const used = [...contract.client.brands.flatMap((b) => b.brand_ids), ...contract.watchlist.flatMap((w) => w.brand_ids ?? [])];
  const unknown = used.filter((id) => !known.has(id));
  if (unknown.length) return { error: `not brands in this workspace: ${[...new Set(unknown)].join(", ")}` };
  if (!contract.client.brands.some((b) => b.brand_ids.length)) return { error: "pick at least one of the client's brands" };
  if (!contract.watchlist.some((w) => (w.brand_ids ?? []).length)) return { error: "pick at least one brand to watch" };
  const formats = Array.isArray(input.formats) ? input.formats.filter((f): f is ReportFormat => FORMATS.includes(f as ReportFormat)) : previous?.formats ?? FORMATS;
  if (!formats.length) return { error: "pick PowerPoint, PDF or both" };
  const clean: WeeklyContract = {
    title: String(contract.title ?? "Weekly Competitor Pulse").slice(0, 60),
    workspace: workspaceId,
    client: { name: String(contract.client.name).slice(0, 60), brands: contract.client.brands.filter((b) => b.brand_ids.length).map((b) => ({ name: String(b.name).slice(0, 60), brand_ids: b.brand_ids })) },
    watchlist: contract.watchlist.filter((w) => (w.brand_ids ?? []).length || (w.untracked ?? []).length).slice(0, 12).map((w) => ({
      name: String(w.name).slice(0, 60), ...(w.short ? { short: String(w.short).slice(0, 20) } : {}), group: w.group === "when_relevant" ? "when_relevant" : "core", brand_ids: w.brand_ids ?? [], ...(w.untracked?.length ? { untracked: w.untracked.map(String).slice(0, 5) } : {}),
    })),
    ...(contract.platforms ? { platforms: contract.platforms } : {}),
    ...(contract.rules ? { rules: contract.rules } : {}),
  };
  return { contract: clean, formats, ...(previous?.last_week ? { last_week: previous.last_week } : {}) };
}
