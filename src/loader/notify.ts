/**
 * Telling people about a load (DECISIONS, 10 Oct 2026): a held load goes to Fair's data ops (accounts with the data_ops
 * duty); a load with warnings goes to them and to the scraper team (SCRAPER_TEAM_EMAILS), so the source gets fixed.
 * Every notice is kept on the load whether or not email is set up, and the CMS shows it.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { appUrl } from "../config/app";
import { SCRAPER_TEAM } from "../config/loads";
import { sendEmail } from "../delivery/email";
import type { Check } from "./checks";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function notifyLoad(loadId: string, checks: Check[], held: boolean): Promise<{ to: string[]; sent: boolean; error?: string } | null> {
  const bad = checks.filter((c) => c.outcome === (held ? "hold" : "warn"));
  if (!bad.length) return null;
  const l = ((await sql.query(`select workspace_id, source, report from staging.loads where id = $1`, [loadId])) as { workspace_id: string; source: string; report: { files?: { file: string }[] } }[])[0];
  const ops = ((await sql.query(`select email from accounts where 'data_ops' = any(staff) and email is not null`)) as { email: string }[]).map((r) => r.email);
  const to = [...new Set([...ops, ...(held ? [] : SCRAPER_TEAM)])];
  const files = (l.report.files ?? []).map((f) => f.file).filter(Boolean);
  const subject = held ? `Load held: ${l.workspace_id}` : `Loaded with warnings: ${l.workspace_id}`;
  const link = appUrl() ? `${appUrl()}/admin/workspaces/${l.workspace_id}` : null;
  const lines = bad.map((c) => `${c.label}: ${c.detail}`);
  const text = [held ? "This load is held: nothing reached the dashboards. Let it in or throw it away from the CMS." : "This load went in. These rows are flagged and stay out of rates and medians until the source is fixed.", "", `Files: ${files.join(", ")}`, "", ...lines, ...(link ? ["", link] : [])].join("\n");
  const html = `<p>${esc(text.split("\n")[0])}</p><p>Files: ${esc(files.join(", "))}</p><ul>${bad.map((c) => `<li><b>${esc(c.label)}</b>: ${esc(c.detail)}</li>`).join("")}</ul>${link ? `<p><a href="${esc(link)}">Open the workspace in the CMS</a></p>` : ""}`;
  const r = to.length ? await sendEmail({ to, subject, html, text }) : { ok: false as const, error: "no one to tell: no data ops account has an email" };
  const notice = { at: new Date().toISOString(), subject, to, sent: r.ok, ...(r.ok ? {} : { error: r.error }) };
  await sql.query(`update staging.loads set report = report || $2::jsonb where id = $1`, [loadId, toJson({ notice })]);
  return { to, sent: r.ok, ...(r.ok ? {} : { error: r.error }) };
}
