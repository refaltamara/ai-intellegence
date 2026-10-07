/**
 * Client creations (CMS plan, "The CMS"): everything clients made on their teams, one by one,
 * with its workspace, maker and status, and what Builders suggested to Fair. Role owners
 * read them to shape the next version (a pattern comes into Fair's role through the Role
 * Lab as a new draft); they answer a suggestion so the Builder knows.
 */
import Link from "next/link";
import { allCreations, KIND_LABEL, type CreationStatus } from "@/company/creations";
import { listSuggestions } from "@/company/changes";
import { ROLES, isRoleId } from "@/roles/model";
import { Act } from "@/ui/company/Act";
import { POLICY_HELP } from "@/roles/policy";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { draft: "Draft", waiting: "Waiting", approved: "Live", sent_back: "Sent back", rejected: "Rejected", removed: "Removed" };
const FILTERS: [string, string][] = [["live", "Live"], ["waiting", "Waiting"], ["all", "Everything"]];
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

export default async function AdminCreations({ searchParams }: { searchParams: Promise<{ show?: string; role?: string }> }) {
  const sp = await searchParams;
  const status: CreationStatus[] | undefined = sp.show === "all" ? undefined : sp.show === "waiting" ? ["waiting"] : ["approved"];
  const role = isRoleId(sp.role) ? sp.role : undefined;
  const [rows, suggestions] = await Promise.all([allCreations({ status, role }), listSuggestions({})]);
  const open = suggestions.filter((s) => (!role || s.role === role) && (s.status === "new" || s.status === "seen"));
  const answered = suggestions.filter((s) => (!role || s.role === role) && (s.status === "adopted" || s.status === "declined"));
  const href = (o: { show?: string; role?: string }) => `/admin/creations?${new URLSearchParams(Object.entries({ show: sp.show, role: sp.role, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const what = (spec: Record<string, unknown>, kind: string) => kind === "term" ? `Say "${spec.say}", not "${spec.not}"` : String(spec.description ?? spec.text ?? "");
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Client creations</h1><span className="meta">What clients made on their teams, and what their Builders sent to Fair</span></div></div>
      <div className="wrap wide cms">
        <div className="cats">
          {FILTERS.map(([k, label]) => <Link key={k} href={href({ show: k === "live" ? "" : k })} className={(sp.show ?? "live") === k || (!sp.show && k === "live") ? "on" : ""}>{label}</Link>)}
          <span className="sep" />
          <Link href={href({ role: "" })} className={!role ? "on" : ""}>Every role</Link>
          {Object.values(ROLES).map((r) => <Link key={r.id} href={href({ role: r.id })} className={role === r.id ? "on" : ""}>{r.codename}</Link>)}
        </div>

        <h2 className="cmsh">Suggested to Fair</h2>
        {open.length === 0 ? <p className="muted">Nothing waiting for an answer.</p> : (
          <div className="tablewrap people"><table>
            <thead><tr><th>When</th><th>Client</th><th>Role</th><th>What</th><th>Their note</th><th>By</th><th /></tr></thead>
            <tbody>{open.map((s) => (
              <tr key={s.id}>
                <td className="muted">{day(s.created_at)}</td><td>{s.workspace_name}</td><td>{ROLES[s.role]?.codename ?? s.role}</td>
                <td>{s.ref_kind === "creation" ? <b>{s.title ?? "A creation"}</b> : <><b>{POLICY_HELP[s.ref]?.label ?? s.ref}</b> <span className="code">{JSON.stringify(s.value)}</span></>}</td>
                <td>{s.note}</td><td className="muted">{s.by_email}{s.status === "seen" ? ` · seen by ${s.fair_by}` : ""}</td>
                <td className="acts">
                  {s.status === "new" && <Act label="Seen" url="/api/admin/creations" body={{ id: s.id, status: "seen" }} />}
                  <Act label="Adopt" url="/api/admin/creations" body={{ id: s.id, status: "adopted" }} ask="A line for the client (it shows on their page)" />
                  <Act label="Not now" url="/api/admin/creations" body={{ id: s.id, status: "declined" }} ask="Why not, in a line for the client" />
                </td>
              </tr>))}
            </tbody></table></div>
        )}
        {answered.length > 0 && <p className="muted">{answered.length} answered: {answered.slice(0, 6).map((s) => `${s.workspace_name} · ${s.title ?? s.ref} (${s.status})`).join("; ")}</p>}

        <h2 className="cmsh">Creations</h2>
        <div className="tablewrap people"><table>
          <thead><tr><th>Updated</th><th>Client</th><th>Role</th><th>Kind</th><th>Title</th><th>What</th><th>Made by</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="muted">{day(c.updated_at)}</td><td>{c.workspace_name}</td><td>{ROLES[c.role]?.codename ?? c.role}</td><td>{KIND_LABEL[c.kind]}</td>
                <td><b>{c.title}</b></td><td className="muted">{what(c.spec, c.kind).slice(0, 140)}</td>
                <td>{c.maker_name ?? c.maker_email}{c.approver && c.approver !== c.maker_email ? <small className="muted"> · approved by {c.approver}</small> : null}</td>
                <td>{STATUS[c.status]}</td>
                <td className="acts">{c.status === "approved" && (c.kind === "skill" || c.kind === "deck_template") && <Act label={`Adopt into ${ROLES[c.role]?.codename ?? "the role"}`} url="/api/admin/creations" body={{ adopt: c.id }} confirm={`Add "${c.title}" to the next draft of Fair's ${ROLES[c.role]?.codename}? Its shape is copied, never the client's data; the draft goes through the role's tests before anyone releases it.`} done="In the draft" />}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="muted" colSpan={9}>Nothing here yet.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </section>
  );
}
