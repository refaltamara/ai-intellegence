"use client";
/**
 * Our Chorus → Case words (DECISIONS, 7 Oct 2026): the sister brands named beside the subject and
 * the words a boycott uses, with what each matches in the data. Anyone sees what a word would match
 * before it is saved; a Builder adds and removes the team's own (Fair's stay). Free: words are
 * counted in the database.
 */
import { useEffect, useState } from "react";
import type { CaseWords as Words } from "@/company/caseWords";

const n = (x: number) => x.toLocaleString("en-US");
const U = "/api/builder/case-words";

async function post(body: unknown) {
  const r = await fetch(U, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true as const, ...j } : { ok: false as const, error: (j.error as string) ?? `HTTP ${r.status}` };
}

export function CaseWords({ builder }: { builder: boolean }) {
  const [w, setW] = useState<Words | null>(null);
  const [name, setName] = useState("");
  const [terms, setTerms] = useState("");
  const [word, setWord] = useState("");
  const [check, setCheck] = useState<{ list: string; posts: number; comments: number; terms: string[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch(U).then((r) => (r.ok ? r.json() : null)).then((j) => j && setW(j)); }, []);
  async function preview(list: "partners" | "boycott") {
    setMsg(""); setBusy(true);
    const r = await post({ list, action: "preview", name: list === "partners" ? name : word, terms: list === "partners" ? terms : word });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setCheck({ list, ...(r.preview as { posts: number; comments: number; terms: string[] }) });
  }
  async function change(list: "partners" | "boycott", action: "add" | "remove", o: { name?: string; terms?: string }) {
    setMsg(""); setBusy(true);
    const r = await post({ list, action, ...o });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setW(r.words as Words); setCheck(null); setName(""); setTerms(""); setWord("");
  }
  if (!w) return <p className="muted">Reading the case words…</p>;
  return (
    <div className="casewords">
      <h3>Sister brands <small>named beside you in posts and comments; the Sister brands slide and the chronology count them</small></h3>
      <ul className="clist">
        {w.partners.map((p) => (
          <li key={p.name} className="crow">
            <div><b>{p.name}</b><span className="kind">{p.by ? `added by ${p.by}` : "Fair set"}</span><p>{p.terms.join(", ")}</p></div>
            <span className="acts"><small className="muted">{n(p.posts)} posts · {n(p.comments)} comments</small>{builder && p.by && <button className="btn sm ghost" disabled={busy} onClick={() => change("partners", "remove", { name: p.name })}>Remove</button>}</span>
          </li>
        ))}
        {!w.partners.length && <li className="muted">None yet.</li>}
      </ul>
      <div className="cwadd">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand, e.g. Instaperfect" maxLength={40} />
        <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Words people use for it, comma between (optional)" maxLength={200} />
        <button className="btn sm" disabled={busy || !name.trim()} onClick={() => preview("partners")}>See what it matches</button>
        {check?.list === "partners" && <span className="cwcheck">{check.terms.join(", ")}: <b>{n(check.posts)}</b> posts and <b>{n(check.comments)}</b> comments in the data so far {builder ? <button className="btn pri sm" disabled={busy} onClick={() => change("partners", "add", { name, terms })}>Add</button> : <small className="muted">Ask your Builder to add it.</small>}</span>}
      </div>

      <h3>Boycott words <small>a post or comment using one counts as a boycott call</small></h3>
      <div className="chips">
        {w.boycott.map((b) => (
          <span key={b.term} className="ms-chip" title={`${n(b.posts)} posts · ${n(b.comments)} comments${b.by ? ` · added by ${b.by}` : " · Fair set"}`}>
            {b.term} <small className="muted">{n(b.posts + b.comments)}</small>
            {builder && b.by && <i title="Remove" onClick={() => !busy && change("boycott", "remove", { terms: b.term })}>×</i>}
          </span>
        ))}
      </div>
      <div className="cwadd">
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="A word, e.g. tak beli" maxLength={40} />
        <button className="btn sm" disabled={busy || word.trim().length < 2} onClick={() => preview("boycott")}>See what it matches</button>
        {check?.list === "boycott" && <span className="cwcheck"><b>{n(check.posts)}</b> posts and <b>{n(check.comments)}</b> comments {builder ? <button className="btn pri sm" disabled={busy} onClick={() => change("boycott", "add", { terms: word })}>Add</button> : <small className="muted">Ask your Builder to add it.</small>}</span>}
      </div>
      {msg && <div className="errbox">{msg}</div>}
    </div>
  );
}
