"use client";
/**
 * Something CeMO made or proposed for the team (src/company/tools.ts), as a card in the
 * thread. A Builder adds a creation for everyone or applies a change; a Member sends a
 * creation to the Builder. The buttons call the server, which checks the level and the
 * guard rails again; the card only shows what came back.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ToolCallRecord } from "@/chat/persist";
import type { Proposal } from "@/company/tools";
import { cellOf, columnsOf } from "./table";

const KIND: Record<string, string> = { skill: "Skill", deck_template: "Deck template", rule: "House rule", fact: "Memory", term: "Vocabulary" };
const STATUS: Record<string, string> = {
  draft: "Draft · works for you only",
  waiting: "Waiting for your Builder",
  approved: "Live for everyone on the team",
  sent_back: "Sent back",
  rejected: "Not approved",
  removed: "Removed",
};
const show = (v: unknown) => (v == null ? "Fair's" : Array.isArray(v) ? v.join(", ") || "none" : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x}`).join(", ") : String(v));

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? `HTTP ${r.status}` };
}

export function ProposalCard({ tool, codename }: { tool: ToolCallRecord; codename?: string }) {
  const p = tool.proposal as Proposal;
  if (p.type === "change") return <ChangeCard p={p} codename={codename} />;
  return <CreationCard p={p} tool={tool} codename={codename} />;
}

function CreationCard({ p, tool, codename }: { p: Extract<Proposal, { type: "creation" }>; tool: ToolCallRecord; codename?: string }) {
  const [status, setStatus] = useState(p.status);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    // the card may be old: read where it is now
    void fetch(`/api/builder/creations?id=${p.id}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.creation) { setStatus(j.creation.status); setNote(j.creation.note); } });
  }, [p.id]);
  async function act(action: string) {
    setBusy(true); setMsg("");
    const r = await post("/api/builder/creations", { action, id: p.id });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? "That did not work."); return; }
    setStatus((r.creation as { status: typeof status }).status);
  }
  const rows = tool.rows ?? [];
  const cols = columnsOf(rows).slice(0, 6);
  const open = status === "draft" || status === "sent_back";
  return (
    <div className="card proposal">
      <h4><span><i className="badge client">{KIND[p.kind]}</i>{p.title}</span><span className={`pstatus ${status}`}>{STATUS[status] ?? status}</span></h4>
      {(p.detail.some(Boolean) || rows.length > 0 || (status === "sent_back" && note)) && <div className="body">
        {p.detail.filter(Boolean).map((d, i) => <p key={i}>{d}</p>)}
        {rows.length > 0 && (
          <>
            <small className="muted">Tried on your data: {rows.length} row{rows.length === 1 ? "" : "s"}</small>
            <div className="tablewrap still mini">
              <table><thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{cellOf(c, r[c])}</td>)}</tr>)}</tbody></table>
            </div>
          </>
        )}
        {status === "sent_back" && note && <p className="pnote">Your Builder: {note}</p>}
      </div>}
      <footer>
        {msg && <span className="err">{msg}</span>}
        {open && p.builder && <button className="btn pri sm" disabled={busy} onClick={() => act("add")}>Add for everyone</button>}
        {open && !p.builder && <button className="btn pri sm" disabled={busy} onClick={() => act("submit")}>{status === "sent_back" ? "Send again" : "Send to your Builder"}</button>}
        {open && <button className="btn sm ghost" disabled={busy} onClick={() => act("discard")}>Discard</button>}
        {status === "approved" && <Link className="btn sm ghost" href="/company">See it in Our {codename ?? "team"}</Link>}
        {status === "waiting" && <Link className="btn sm ghost" href="/company">Your creations</Link>}
      </footer>
    </div>
  );
}

function ChangeCard({ p, codename }: { p: Extract<Proposal, { type: "change" }>; codename?: string }) {
  const [state, setState] = useState<{ applied?: number; undone?: boolean; busy?: boolean; msg?: string }>({});
  async function apply() {
    setState({ busy: true });
    const r = await post("/api/builder/company", { action: "apply", changes: p.changes, note: p.note });
    setState(r.ok ? { applied: r.version as number } : { msg: r.error });
  }
  async function undo() {
    if (!state.applied) return;
    setState({ ...state, busy: true });
    const r = await post("/api/builder/company", { action: "undo", version: state.applied });
    setState(r.ok ? { ...state, busy: false, undone: true } : { ...state, busy: false, msg: r.error });
  }
  return (
    <div className="card proposal">
      <h4><span><i className="badge client">Change</i>For everyone on the team</span><span className={`pstatus ${state.applied ? (state.undone ? "removed" : "approved") : "draft"}`}>{state.applied ? (state.undone ? "Undone" : "Applied") : "Not applied yet"}</span></h4>
      <div className="body">
        <table className="changes"><tbody>
          {p.preview.lines.map((l) => <tr key={l.path}><td>{l.label}</td><td className="from">{show(l.from)}</td><td>→</td><td className="to">{show(l.to)}</td></tr>)}
        </tbody></table>
        {p.preview.dropped.length > 0 && <ul className="dropped">{p.preview.dropped.map((d) => <li key={d.path}>{d.label}: {d.why}</li>)}</ul>}
        {p.note && <small className="muted">{p.note}</small>}
      </div>
      <footer>
        {state.msg && <span className="err">{state.msg}</span>}
        {!p.builder && <span className="muted">Only a Builder can apply this.</span>}
        {p.builder && !state.applied && <button className="btn pri sm" disabled={state.busy} onClick={apply}>Apply for everyone</button>}
        {state.applied && !state.undone && <button className="btn sm ghost" disabled={state.busy} onClick={undo}>Undo</button>}
        {state.applied && <Link className="btn sm ghost" href="/company">Our {codename ?? "team"}</Link>}
      </footer>
    </div>
  );
}
