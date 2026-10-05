import Link from "next/link";
import { auditRows } from "@/cms/data";

export const dynamic = "force-dynamic";

const AREAS = [["", "Everything"], ["role", "Roles"], ["company", "Company versions"], ["people", "People"]];
const short = (v: unknown) => (v == null ? "" : JSON.stringify(v).slice(0, 140));

/** Audit: every change to a role, a company's version or a person, newest first. Append-only. */
export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ area?: string; ws?: string }> }) {
  const sp = await searchParams;
  const rows = await auditRows({ area: sp.area || null, workspace: sp.ws || null, limit: 300 });
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Audit</h1><span className="meta">{rows.length} changes{sp.ws ? ` in ${sp.ws}` : ""}</span></div></div>
      <div className="wrap wide cms">
        <div className="cats">{AREAS.map(([a, label]) => <Link key={a} href={a ? `/admin/audit?area=${a}` : "/admin/audit"} className={(sp.area ?? "") === a ? "on" : ""}>{label}</Link>)}</div>
        <div className="tablewrap people">
          <table>
            <thead><tr><th>When (WIB)</th><th>Who</th><th>What</th><th>On</th><th>Workspace</th><th>Before</th><th>After</th><th>Note</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}</td>
                  <td>{r.actor}</td>
                  <td>{r.area} · {r.action}</td>
                  <td>{r.path ?? ""}</td>
                  <td>{r.workspace_id ? <Link href={`/admin/audit?ws=${r.workspace_id}`}>{r.workspace_id}</Link> : <span className="muted">Fair</span>}</td>
                  <td className="muted code">{short(r.old)}</td>
                  <td className="code">{short(r.new)}</td>
                  <td className="muted">{r.note ?? ""}</td>
                </tr>
              ))}
              {!rows.length && <tr><td className="muted" colSpan={8}>No changes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
