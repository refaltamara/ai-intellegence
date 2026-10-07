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
import { DeckChangeCard } from "./decks/DeckChangeCard";

const KIND: Record<string, string> = { skill: "Skill", deck_template: "Deck template", rule: "House rule", fact: "Memory", term: "Vocabulary", extension: "Data extension" };
const n = (x: number) => Math.round(x).toLocaleString("en-US");
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
  if (p.type === "extension") return <ExtensionCard p={p} codename={codename} />;
  if (p.type === "deck_change") return <DeckChangeCard p={p} />;
  if (p.type === "case_words") return <CaseWordsCard p={p} codename={codename} />;
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

const SOURCE: Record<string, string> = { rule: "keyword rules, counted in the database", cemo: "CeMO reading each", file: "a file you upload" };

/** A data extension: the sample, what filling costs now and a day after; a Builder approves it to fill it. */
function ExtensionCard({ p, codename }: { p: Extract<Proposal, { type: "extension" }>; codename?: string }) {
  const [status, setStatus] = useState(p.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    void fetch(`/api/builder/creations?id=${p.id}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.creation) setStatus(j.creation.status); });
  }, [p.id]);
  async function act(action: string) {
    setBusy(true); setMsg("");
    const r = await post("/api/builder/creations", { action, id: p.id });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? "That did not work."); return; }
    setStatus((r.creation as { status: typeof status }).status);
  }
  const e = p.estimate;
  const total = Object.values(e.counts).reduce((a, b) => a + b, 0);
  const open = status === "draft" || status === "sent_back";
  return (
    <div className="card proposal">
      <h4><span><i className="badge client">Data extension</i>{p.title} on {p.target}s</span><span className={`pstatus ${status}`}>{status === "approved" ? "Approved · filling" : STATUS[status] ?? status}</span></h4>
      <div className="body">
        <p>Values: {p.values.join(", ")} · from {SOURCE[p.source] ?? p.source}{p.source === "cemo" ? ` ${p.target}` : ""}.</p>
        {total > 0 && (
          <div className="extcounts">
            {Object.entries(e.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="tag">{k} · {n(v)}</span>)}
            <small className="muted">{p.source === "cemo" ? `in a sample of ${n(total)} ${p.target}s` : `over all ${n(total)} ${p.target}s`}</small>
          </div>
        )}
        {e.examples.length > 0 && <ul className="extex">{e.examples.slice(0, 4).map((x) => <li key={x.ref}><b>{x.value ?? "none"}</b> {x.label} · <span className="muted">{x.text.slice(0, 110)}</span></li>)}</ul>}
        <p className="extcost">
          {p.source === "cemo"
            ? <>Filling it: about <b>{n(e.credits_now)} credits</b> for {n(Math.max(0, e.rows - e.done))} {p.target}s, then about <b>{n(e.credits_per_day)} a day</b> for new ones ({n(e.new_rows_per_day)} a day lately). The sample used {n(e.sample_credits)}.</>
            : p.source === "rule" ? <>Filling it costs no credits: the rules run in the database over {n(e.rows)} {p.target}s, again every day.</> : <>Upload the file on Our {codename ?? "team"} once it is approved.</>}
        </p>
        {p.stopped && <p className="pnote">{p.stopped}</p>}
      </div>
      <footer>
        {msg && <span className="err">{msg}</span>}
        {open && p.builder && <button className="btn pri sm" disabled={busy} onClick={() => act("add")}>{p.source === "cemo" ? `Approve and fill (~${n(e.credits_now)} credits)` : "Approve and fill"}</button>}
        {open && !p.builder && <button className="btn pri sm" disabled={busy} onClick={() => act("submit")}>Send to your Builder</button>}
        {open && <button className="btn sm ghost" disabled={busy} onClick={() => act("discard")}>Discard</button>}
        {status !== "draft" && <Link className="btn sm ghost" href="/company#extensions">Our {codename ?? "team"}</Link>}
      </footer>
    </div>
  );
}

/** A sister brand or boycott word, with what it matches; a Builder saves it (free: counted in the database). */
function CaseWordsCard({ p, codename }: { p: Extract<Proposal, { type: "case_words" }>; codename?: string }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true); setMsg("");
    const r = await post("/api/builder/case-words", { list: p.list, action: p.action, name: p.name, terms: p.list === "boycott" ? p.terms : p.terms });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? "That did not work."); return; }
    setDone(true);
  }
  const what = p.list === "partners" ? `Sister brand: ${p.name}` : `Boycott word${p.terms.length > 1 ? "s" : ""}: ${p.terms.join(", ")}`;
  return (
    <div className="card proposal">
      <h4><span><i className="badge client">Case words</i>{p.action === "remove" ? `Remove ${what}` : what}</span><span className={`pstatus ${done ? "approved" : "draft"}`}>{done ? "Saved" : "Not saved yet"}</span></h4>
      <div className="body">
        {p.list === "partners" && <p>Words: {p.terms.join(", ")}</p>}
        <p>Matches {n(p.posts)} posts and {n(p.comments)} comments in the data so far. Free: counted in the database.</p>
      </div>
      <footer>
        {msg && <span className="err">{msg}</span>}
        {!done && p.builder && <button className="btn pri sm" disabled={busy} onClick={save}>{p.action === "remove" ? "Remove" : "Add"}</button>}
        {!p.builder && <span className="muted">Only a Builder saves case words; ask yours.</span>}
        <Link className="btn sm ghost" href="/company#case-words">Our {codename ?? "team"}</Link>
      </footer>
    </div>
  );
}
