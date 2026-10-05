"use client";
/** The Role Lab: talk to the Lab's AI about this draft; it edits, writes recipes and tests, and says what it changed. */
import { useRouter } from "next/navigation";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; text: string; actions?: string[] };

const EXAMPLES = [
  "Read the signals and tell me what this role should improve first.",
  "Add an analysis that shows complaints by topic, and a golden question for it.",
  "Make CeMO's holding statements shorter; keep the [brackets] rule.",
];

export function LabChat({ role, version, initial, model, tokens }: { role: string; version: string; initial: Msg[]; model: boolean; tokens: number }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(t: string) {
    if (!t.trim()) return;
    setBusy(true); setError("");
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setText("");
    const r = await fetch("/api/admin/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, version, text: t }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "The Lab could not answer."); return; }
    setMsgs((m) => [...m, { role: "assistant", text: j.reply, actions: j.actions }]);
    if (j.actions?.length) router.refresh();
  }
  return (
    <div className="cmsblock lab">
      <header><h2>Role Lab</h2><span className="hint">{model ? `The Lab's AI edits this draft with you. ${tokens ? `${tokens.toLocaleString("en-US")} tokens so far.` : ""}` : "The model is not configured here, so the Lab cannot answer; use the form below."}</span></header>
      <div className="card labbox">
        <div className="labfeed">
          {!msgs.length && <div className="labex">{EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} disabled={busy || !model}>{e}</button>)}</div>}
          {msgs.map((m, i) => (
            <div key={i} className={`labmsg ${m.role}`}>
              <p>{m.text}</p>
              {m.actions?.length ? <ul>{m.actions.map((a) => <li key={a}>{a}</li>)}</ul> : null}
            </div>
          ))}
          {busy && <div className="labmsg assistant"><p className="muted">Working on the draft…</p></div>}
        </div>
        <form className="labinput" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask the Lab to improve this role…" disabled={busy || !model} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <button className="btn pri" type="submit" disabled={busy || !model || !text.trim()}>Send</button>
        </form>
        {error && <div className="errbox">{error}</div>}
      </div>
    </div>
  );
}
