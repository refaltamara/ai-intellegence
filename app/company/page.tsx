/**
 * "Our Chorus" (CMS plan, The Builder; DECISIONS 4 Oct 2026): the team's own version of its
 * role. A Builder approves what Members made, undoes a change, brings a setting back to
 * Fair's and suggests something to Fair; a Member sees the same page and the status of
 * what they made. Every button goes through /api/builder/*, which checks the level again.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { companyPage } from "@/company/page";
import { KIND_LABEL, type Creation } from "@/company/creations";
import { sql } from "@/db/client";
import { POLICY_HELP } from "@/roles/policy";
import { Act } from "@/ui/company/Act";
import { MemoryForm } from "@/ui/company/MemoryForm";
import { cellOf, columnsOf } from "@/ui/table";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const C = "/api/builder/creations";
const P = "/api/builder/company";
const STATUS: Record<string, string> = { draft: "Draft", waiting: "Waiting for a Builder", approved: "Live", sent_back: "Sent back", rejected: "Not approved", removed: "Removed" };
const show = (v: unknown) => (v == null ? "Fair's" : Array.isArray(v) ? v.join(", ") || "none" : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x}`).join(", ") : String(v));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

function what(c: Creation): string {
  const s = c.spec as Record<string, unknown>;
  if (c.kind === "skill") return String(s.description ?? "");
  if (c.kind === "deck_template") return `${s.grain === "week" ? "Weekly" : "Monthly"} · ${((s.rep_slides ?? s.social_slides ?? s.slides) as string[]).length} slides${s.description ? ` · ${s.description}` : ""}`;
  if (c.kind === "term") return c.title;
  return String(s.text ?? "");
}

export default async function CompanyPage() {
  const ws = await currentWorkspaceId();
  const [actor, role] = await Promise.all([currentActor(), currentRole(ws)]);
  if (!actor || !can(actor, "role.use", { workspace: ws, role: role.id })) redirect("/");
  const [d, clientRow] = await Promise.all([
    companyPage(ws, role, actor),
    sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id and b.workspace_id = w.id where w.id = $1", [ws]) as unknown as Promise<{ name: string }[]>,
  ]);
  const client = clientRow[0]?.name ?? "Your team";
  const badge = (c: Creation) => <i className="badge client" title={`Made by ${c.maker_name ?? c.maker_email}${c.approver && c.approver !== c.maker_email ? `, approved by ${c.approver}` : ""}`}>{client}</i>;
  const live = (k: Creation["kind"][]) => d.creations.filter((c) => k.includes(c.kind) && c.status === "approved");
  const mine = d.creations.filter((c) => c.maker_email === d.me && c.status !== "approved" && c.status !== "removed");
  const removed = d.creations.filter((c) => c.status === "removed" && c.approver);
  const suggested = new Set(d.suggestions.map((s) => s.ref));
  const row = (c: Creation, acts = true) => (
    <li key={c.id} className="crow">
      <div>
        <b>{c.title}</b>{badge(c)}<span className="kind">{KIND_LABEL[c.kind]}</span>
        {what(c) !== c.title && <p>{what(c)}</p>}
      </div>
      {acts && (
        <span className="acts">
          {d.builder && c.status === "approved" && (suggested.has(c.id) ? <small className="muted">Sent to Fair</small> : <Act label="Suggest to Fair" url={P} body={{ action: "suggest", kind: "creation", ref: c.id }} ask="Why should every client have this? (one line for Fair's role owners)" done="Sent to Fair" />)}
          {d.builder && c.status === "approved" && <Act label="Remove" url={C} body={{ action: "remove", id: c.id }} confirm={`Remove "${c.title}" for everyone? You can bring it back from the history.`} />}
        </span>
      )}
    </li>
  );
  return (
    <section className="screen company">
      <div className="topbar">
        <div><h1>Our {role.codename}</h1><span className="meta">{client}&apos;s {role.codename} ({role.label}) · on Fair&apos;s {role.codename} {d.fair_version} · {d.follows}</span></div>
        <span className="badgekey"><i className="badge fair">Fair</i> came with the role <i className="badge client">{client}</i> your team made</span>
      </div>
      <div className="wrap">
        {d.next && (
          <div className="dcard nextrel">
            <h3>Coming in {role.codename} {d.next.version}</h3>
            {d.next.note && <p>{d.next.note}</p>}
            {d.next.lines.length > 0 && <ul>{d.next.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
            <small className="muted">Everything your team changed and made stays as it is.</small>
          </div>
        )}

        {d.builder && (
          <div className="dsection">
            <header><h2>Waiting for you</h2><span>What Members made. It works for its maker now; once you approve it, it is there for everyone on the team.</span></header>
            {d.waiting.length === 0 ? <div className="dcard empty">Nothing waiting.</div> : (
              <ul className="clist">
                {d.waiting.map((c) => (
                  <li key={c.id} className="crow wait">
                    <div>
                      <b>{c.title}</b><span className="kind">{KIND_LABEL[c.kind]}</span>
                      <p>{what(c)}</p>
                      <small className="muted">From {c.maker_name ?? c.maker_email} · {day(c.updated_at)}</small>
                      {c.tried && (
                        c.tried.rows.length ? (
                          <div className="tablewrap still mini"><table><thead><tr>{columnsOf(c.tried.rows).slice(0, 6).map((k) => <th key={k}>{k.replace(/_/g, " ")}</th>)}</tr></thead>
                            <tbody>{c.tried.rows.slice(0, 5).map((r, i) => <tr key={i}>{columnsOf(c.tried!.rows).slice(0, 6).map((k) => <td key={k}>{cellOf(k, r[k])}</td>)}</tr>)}</tbody></table>
                            <small className="muted">Tried on your data{c.tried.window ? `, ${c.tried.window.from} to ${c.tried.window.to}` : ""}</small></div>
                        ) : <small className="muted">Tried on your data: {c.tried.message ?? "no rows"}</small>
                      )}
                    </div>
                    <span className="acts">
                      <Act label="Approve" className="btn pri sm" url={C} body={{ action: "approve", id: c.id }} />
                      <Act label="Send back" url={C} body={{ action: "send_back", id: c.id }} ask="What should they change?" />
                      <Act label="Reject" url={C} body={{ action: "reject", id: c.id }} confirm="Reject it? Its maker keeps it as their own draft." />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="dsection">
          <header><h2>What {client} changed</h2><span>Settings your team changed from Fair&apos;s {role.codename}. A new Fair release never touches them.{d.builder ? " Change more on the Dashboard (Customise, Why this level?) or by asking CeMO in Builder mode." : ""}</span></header>
          {d.changes.length === 0 ? <div className="dcard empty">Nothing yet: your team runs Fair&apos;s {role.codename} as released.</div> : (
            <div className="dcard tablewrap still">
              <table><thead><tr><th>Setting</th><th>Fair&apos;s</th><th>{client}&apos;s</th><th /></tr></thead>
                <tbody>{d.changes.map((c) => (
                  <tr key={c.path}><td>{c.label}</td><td className="muted">{show(c.fair)}</td><td><b>{show(c.to)}</b> <i className="badge client">{client}</i></td>
                    <td className="acts">{d.builder && <>
                      <Act label="Back to Fair's" url={P} body={{ action: "apply", changes: { [c.path]: null }, note: `Back to Fair's: ${c.label}` }} confirm="Go back to Fair's setting for everyone?" />
                      {suggested.has(c.path) ? <small className="muted">Sent to Fair</small> : <Act label="Suggest to Fair" url={P} body={{ action: "suggest", kind: "setting", ref: c.path }} ask="Why should every client have this? (one line for Fair's role owners)" done="Sent to Fair" />}
                    </>}</td></tr>))}
                </tbody></table>
            </div>
          )}
        </div>

        <div className="dsection">
          <header><h2>Skills</h2><span>Analyses your team made. CeMO uses them in Chats, and they are under + in the composer.</span></header>
          {live(["skill"]).length === 0 ? <div className="dcard empty">None yet. Ask CeMO: &quot;make me a skill that shows complaints by topic every week&quot;.</div> : <ul className="clist">{live(["skill"]).map((c) => row(c))}</ul>}
        </div>

        <div className="dsection">
          <header><h2>Deck templates</h2><span>Under Decks → New deck, after Fair&apos;s. Save one from any deck (⋯ → Save as template).</span></header>
          {live(["deck_template"]).length === 0 ? <div className="dcard empty">None yet.</div> : <ul className="clist">{live(["deck_template"]).map((c) => row(c))}</ul>}
        </div>

        <div className="dsection">
          <header><h2>CeMO&apos;s rules and memory</h2><span>CeMO reads these on every message, under the product&apos;s own rules: they shape tone, naming and drafts, never a number. A correction about the data itself goes to Fair&apos;s data team.</span></header>
          {live(["rule", "fact", "term"]).length > 0 && <ul className="clist">{live(["rule", "fact", "term"]).map((c) => row(c))}</ul>}
          <div className="dcard"><MemoryForm builder={d.builder} /></div>
        </div>

        {mine.length > 0 && (
          <div className="dsection">
            <header><h2>Yours, not shared yet</h2><span>What you made. It works for you now; it reaches everyone once a Builder approves it.</span></header>
            <ul className="clist">{mine.map((c) => (
              <li key={c.id} className="crow">
                <div><b>{c.title}</b><i className="badge mine">{STATUS[c.status]}</i><span className="kind">{KIND_LABEL[c.kind]}</span><p>{what(c)}</p>{c.status === "sent_back" && c.note && <p className="pnote">{c.approver}: {c.note}</p>}</div>
                <span className="acts">
                  {(c.status === "draft" || c.status === "sent_back") && <Act label={c.status === "sent_back" ? "Send again" : d.builder ? "Add for everyone" : "Send to your Builder"} className="btn pri sm" url={C} body={{ action: "submit", id: c.id }} />}
                  {c.status !== "rejected" && <Act label="Discard" url={C} body={{ action: c.status === "waiting" ? "remove" : "discard", id: c.id }} />}
                </span>
              </li>))}
            </ul>
          </div>
        )}

        <div className="dsection">
          <header><h2>History</h2><span>Every change to {client}&apos;s {role.codename}, newest first.</span></header>
          <div className="dcard">
            {d.history.length === 0 && removed.length === 0 ? <div className="empty">No changes yet.</div> : (
              <ul className="hist">
                {d.history.filter((h) => h.lines.length || h.base_version !== null).map((h) => (
                  <li key={h.version}>
                    <span className="when">{day(h.created_at)}</span>
                    <div><b>{h.note ?? "Changed"}</b> <small className="muted">by {h.author ?? "Fair"}</small>
                      {h.lines.length > 0 && <ul>{h.lines.map((l) => <li key={l.path}>{l.label}: {show(l.from)} → {show(l.to)}</li>)}</ul>}
                    </div>
                    <span className="acts">{h.undone_by ? <small className="muted">Undone</small> : d.builder && h.lines.length > 0 && !/^undo v/.test(h.note ?? "") && <Act label="Undo" url={P} body={{ action: "undo", version: h.version }} confirm="Undo this change for everyone?" />}</span>
                  </li>
                ))}
                {removed.map((c) => (
                  <li key={c.id}>
                    <span className="when">{day(c.updated_at)}</span>
                    <div><b>Removed {KIND_LABEL[c.kind].toLowerCase()} &quot;{c.title}&quot;</b></div>
                    <span className="acts">{d.builder && <Act label="Bring back" url={C} body={{ action: "restore", id: c.id }} />}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {d.suggestions.length > 0 && (
          <div className="dsection">
            <header><h2>Sent to Fair</h2><span>What your team suggested to Fair&apos;s {role.codename} owners, and what they said.</span></header>
            <ul className="clist">{d.suggestions.map((s) => (
              <li key={s.id} className="crow"><div><b>{s.ref_kind === "creation" ? s.title ?? "A creation" : `${POLICY_HELP[s.ref]?.label ?? s.ref}: ${show(s.value)}`}</b><span className="kind">{s.status === "new" ? "Sent" : s.status === "seen" ? "Seen by Fair" : s.status === "adopted" ? "Coming to every client" : "Not for now"}</span><p>{s.note}</p>{s.fair_note && <p className="pnote">Fair: {s.fair_note}</p>}</div></li>))}
            </ul>
          </div>
        )}
        <p className="muted foot">Want something only Fair can change (how a number is counted, the brands tracked)? <Link href="/data">Data and settings</Link> or ask your Fair contact.</p>
      </div>
    </section>
  );
}
