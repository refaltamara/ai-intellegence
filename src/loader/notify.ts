/**
 * Telling people about a load (DECISIONS, 10 Oct 2026): a held load goes to Fair's data ops (accounts with the data_ops
 * duty); a load with warnings goes to them and to the scraper team (SCRAPER_TEAM_EMAILS), so the source gets fixed.
 * A case's load goes only to Fair's owners and data ops on that case's list (step 5), and to the scraper team that runs
 * its request. Every notice is kept on the load whether or not email is set up, and the CMS shows it.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { appUrl } from "../config/app";
import { SCRAPER_TEAM } from "../config/loads";
import { sendEmail } from "../delivery/email";
import type { Check } from "./checks";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** who is told: data ops, or for a case's load the owners and data ops on its list; the scraper team when rows were flagged */
export function noticeRecipients(people: { email: string; staff: string[] }[], held: boolean, caseAccess: string[] | null, scraper: string[] = SCRAPER_TEAM): string[] {
  const list = caseAccess ? new Set(caseAccess.map((e) => e.trim().toLowerCase())) : null;
  const ops = people
    .filter((p) => (list ? (p.staff.includes("owner") || p.staff.includes("data_ops")) && list.has(p.email.trim().toLowerCase()) : p.staff.includes("data_ops")))
    .map((p) => p.email);
  return [...new Set([...ops, ...(held ? [] : scraper)])];
}

export async function notifyLoad(loadId: string, checks: Check[], held: boolean): Promise<{ to: string[]; sent: boolean; error?: string } | null> {
  const bad = checks.filter((c) => c.outcome === (held ? "hold" : "warn"));
  if (!bad.length) return null;
  const l = ((await sql.query(
    `select l.workspace_id, l.source, l.report, c.name as case_name, c.access as case_access from staging.loads l left join cases c on c.id = l.case_id where l.id = $1`,
    [loadId],
  )) as { workspace_id: string; source: string; report: { files?: { file: string }[] }; case_name: string | null; case_access: string[] | null }[])[0];
  const people = (await sql.query(`select email, staff from accounts where staff && array['owner', 'data_ops']::text[] and email is not null`)) as { email: string; staff: string[] }[];
  const to = noticeRecipients(people, held, l.case_access);
  const files = (l.report.files ?? []).map((f) => f.file).filter(Boolean);
  const where = l.case_name ? `${l.workspace_id} · case ${l.case_name}` : l.workspace_id;
  const subject = held ? `Load held: ${where}` : `Loaded with warnings: ${where}`;
  const link = appUrl() ? `${appUrl()}/admin/workspaces/${l.workspace_id}` : null;
  const lines = bad.map((c) => `${c.label}: ${c.detail}`);
  const text = [held ? "This load is held: nothing reached the dashboards. Let it in or throw it away from the CMS." : "This load went in. These rows are flagged and stay out of rates and medians until the source is fixed.", "", `Files: ${files.join(", ")}`, "", ...lines, ...(link ? ["", link] : [])].join("\n");
  const html = `<p>${esc(text.split("\n")[0])}</p><p>Files: ${esc(files.join(", "))}</p><ul>${bad.map((c) => `<li><b>${esc(c.label)}</b>: ${esc(c.detail)}</li>`).join("")}</ul>${link ? `<p><a href="${esc(link)}">Open the workspace in the CMS</a></p>` : ""}`;
  const r = to.length ? await sendEmail({ to, subject, html, text }) : { ok: false as const, error: l.case_access ? "no one to tell: no owner or data ops on the case's list has an email" : "no one to tell: no data ops account has an email" };
  const notice = { at: new Date().toISOString(), subject, to, sent: r.ok, ...(r.ok ? {} : { error: r.error }) };
  await sql.query(`update staging.loads set report = report || $2::jsonb where id = $1`, [loadId, toJson({ notice })]);
  return { to, sent: r.ok, ...(r.ok ? {} : { error: r.error }) };
}
