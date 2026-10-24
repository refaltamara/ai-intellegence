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
import { Button, buttonClass } from "./kit/Button";
import { ProposalShell, muted, type ProposalTone } from "./kit/ProposalShell";

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
const tone = (s: string): ProposalTone => (s in STATUS ? (s as ProposalTone) : "draft");
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
  const hasBody = p.detail.some(Boolean) || rows.length > 0 || (status === "sent_back" && !!note);
  return (
    <ProposalShell kind={KIND[p.kind] ?? p.kind} title={p.title} status={STATUS[status] ?? status} tone={tone(status)} error={msg}
      actions={<>
        {open && <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("discard")}>Discard</Button>}
        {status === "approved" && <Link className={buttonClass("outline", "sm")} href="/company">See it in Our {codename ?? "team"}</Link>}
        {status === "waiting" && <Link className={buttonClass("outline", "sm")} href="/company">Your creations</Link>}
        {open && p.builder && <Button size="sm" disabled={busy} onClick={() => act("add")}>Add for everyone</Button>}
        {open && !p.builder && <Button size="sm" disabled={busy} onClick={() => act("submit")}>{status === "sent_back" ? "Send again" : "Send to your Builder"}</Button>}
      </>}>
      {hasBody && <>
        {p.detail.filter(Boolean).map((d, i) => <p key={i}>{d}</p>)}
        {rows.length > 0 && (
          <>
            <small className={muted}>Tried on your data: {rows.length} row{rows.length === 1 ? "" : "s"}</small>
            <MiniTable cols={cols} rows={rows.slice(0, 5)} />
          </>
        )}
        {status === "sent_back" && note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Your Builder: {note}</p>}
      </>}
    </ProposalShell>
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
    <ProposalShell kind="Change" title="For everyone on the team" status={state.applied ? (state.undone ? "Undone" : "Applied") : "Not applied yet"} tone={state.applied ? (state.undone ? "removed" : "approved") : "draft"} error={state.msg}
      actions={<>
        {!p.builder && <span className={muted}>Only a Builder can apply this.</span>}
        {state.applied && !state.undone && <Button variant="ghost" size="sm" disabled={state.busy} onClick={undo}>Undo</Button>}
        {state.applied && <Link className={buttonClass("outline", "sm")} href="/company">Our {codename ?? "team"}</Link>}
        {p.builder && !state.applied && <Button size="sm" disabled={state.busy} onClick={apply}>Apply for everyone</Button>}
      </>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {p.preview.lines.map((l) => (
              <tr key={l.path}>
                <td className="py-1.5 pr-3 text-gray-500">{l.label}</td>
                <td className="py-1.5 pr-2 text-gray-500 line-through decoration-gray-300">{show(l.from)}</td>
                <td className="py-1.5 pr-2 text-gray-400" aria-hidden="true">→</td>
                <td className="py-1.5 font-semibold text-gray-900">{show(l.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.preview.dropped.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-amber-800">{p.preview.dropped.map((d) => <li key={d.path}>{d.label}: {d.why}</li>)}</ul>}
      {p.note && <small className={muted}>{p.note}</small>}
    </ProposalShell>
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
    <ProposalShell kind="Data extension" title={`${p.title} on ${p.target}s`} status={status === "approved" ? "Approved · filling" : STATUS[status] ?? status} tone={tone(status)} error={msg}
      actions={<>
        {open && <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("discard")}>Discard</Button>}
        {status !== "draft" && <Link className={buttonClass("outline", "sm")} href="/company#extensions">Our {codename ?? "team"}</Link>}
        {open && p.builder && <Button size="sm" disabled={busy} onClick={() => act("add")}>{p.source === "cemo" ? `Approve and fill (~${n(e.credits_now)} credits)` : "Approve and fill"}</Button>}
        {open && !p.builder && <Button size="sm" disabled={busy} onClick={() => act("submit")}>Send to your Builder</Button>}
      </>}>
      <p>Values: {p.values.join(", ")} · from {SOURCE[p.source] ?? p.source}{p.source === "cemo" ? ` ${p.target}` : ""}.</p>
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(e.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{k} · {n(v)}</span>)}
          <small className={muted}>{p.source === "cemo" ? `in a sample of ${n(total)} ${p.target}s` : `over all ${n(total)} ${p.target}s`}</small>
        </div>
      )}
      {e.examples.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {e.examples.slice(0, 4).map((x) => <li key={x.ref}><b className="font-semibold text-gray-900">{x.value ?? "none"}</b> {x.label} · <span className="text-gray-500">{x.text.slice(0, 110)}</span></li>)}
        </ul>
      )}
      <p className="rounded-xl bg-gray-50 px-3 py-2">
        {p.source === "cemo"
          ? <>Filling it: about <b className="font-semibold">{n(e.credits_now)} credits</b> for {n(Math.max(0, e.rows - e.done))} {p.target}s, then about <b className="font-semibold">{n(e.credits_per_day)} a day</b> for new ones ({n(e.new_rows_per_day)} a day lately). The sample used {n(e.sample_credits)}.</>
          : p.source === "rule" ? <>Filling it costs no credits: the rules run in the database over {n(e.rows)} {p.target}s, again every day.</> : <>Upload the file on Our {codename ?? "team"} once it is approved.</>}
      </p>
      {p.stopped && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{p.stopped}</p>}
    </ProposalShell>
  );
}

/** A sister brand or boycott word, with what it matches; a Builder saves it (free: counted in the database). */
function CaseWordsCard({ p, codename }: { p: Extract<Proposal, { type: "case_words" }>; codename?: string }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true); setMsg("");
    // a Member's addition waits for a Builder (Our Chorus → Case words)
    const action = p.builder ? p.action : "request";
    const r = await post("/api/builder/case-words", { list: p.list, action, name: p.name, terms: p.terms });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? "That did not work."); return; }
    setDone(true);
  }
  const what = p.list === "partners" ? `Sister brand: ${p.name}` : `Boycott word${p.terms.length > 1 ? "s" : ""}: ${p.terms.join(", ")}`;
  return (
    <ProposalShell kind="Case words" title={p.action === "remove" ? `Remove ${what}` : what} status={done ? (p.builder ? "Saved" : "Waiting for your Builder") : "Not saved yet"} tone={done ? (p.builder ? "approved" : "waiting") : "draft"} error={msg}
      actions={<>
        {!p.builder && p.action === "remove" && <span className={muted}>Only a Builder removes case words; ask yours.</span>}
        <Link className={buttonClass("outline", "sm")} href="/company#case-words">Our {codename ?? "team"}</Link>
        {!done && p.builder && <Button size="sm" disabled={busy} onClick={save}>{p.action === "remove" ? "Remove" : "Add"}</Button>}
        {!done && !p.builder && p.action === "add" && <Button size="sm" disabled={busy} onClick={save}>Send to my Builder</Button>}
      </>}>
      {p.list === "partners" && <p>Words: {p.terms.join(", ")}</p>}
      <p>Matches {n(p.posts)} posts and {n(p.comments)} comments in the data so far. Free: counted in the database.</p>
    </ProposalShell>
  );
}

/** a few rows of what a new skill returned when it was tried */
function MiniTable({ cols, rows }: { cols: string[]; rows: Record<string, unknown>[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-xs">
        <thead><tr className="border-0 border-b border-gray-100 bg-white">{cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold capitalize text-gray-900">{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="px-3 py-2 text-gray-700">{cellOf(c, r[c])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
