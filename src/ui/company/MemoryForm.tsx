"use client";
/**
 * CeMO's rules and memory, added by hand (CMS plan, "CeMO memory and house rules"): a house
 * rule, a fact to remember, or a word the team uses. A Builder's is live at once; a
 * Member's goes to the Builder. The server refuses a rule that would have CeMO compute,
 * invent or drop evidence, and says why.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

const HINT = {
  rule: "Never draft anything about OJK or Bank Indonesia without saying Legal must review",
  fact: "Our fiscal month starts on the 26th",
  term: "",
};

export function MemoryForm({ builder }: { builder: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<"rule" | "fact" | "term">("rule");
  const [text, setText] = useState("");
  const [say, setSay] = useState("");
  const [not, setNot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    const input = kind === "term" ? { say, not } : { text };
    const r = await fetch("/api/builder/creations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "make", kind, input, live: builder }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && !builder) await fetch("/api/builder/creations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", id: j.creation.id }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "That did not work." }); return; }
    setText(""); setSay(""); setNot("");
    setMsg({ ok: true, text: builder ? "Saved for everyone. CeMO reads it from the next message." : "Sent to your Builder." });
    router.refresh();
  }
  return (
    <div className="memform">
      <div className="seg sm">
        {(["rule", "fact", "term"] as const).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k === "rule" ? "House rule" : k === "fact" ? "Something to remember" : "A word we use"}</button>)}
      </div>
      {kind === "term"
        ? <div className="row"><input value={say} onChange={(e) => setSay(e.target.value)} placeholder="Say… (isu)" maxLength={40} /><span>not</span><input value={not} onChange={(e) => setNot(e.target.value)} placeholder="…instead of (issue)" maxLength={40} /></div>
        : <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={HINT[kind]} maxLength={300} rows={2} />}
      <div className="row end">
        {msg && <small className={msg.ok ? "ok" : "err"}>{msg.text}</small>}
        <button className="btn pri sm" disabled={busy || (kind === "term" ? !say.trim() || !not.trim() : !text.trim())} onClick={save}>{builder ? "Add for everyone" : "Send to your Builder"}</button>
      </div>
    </div>
  );
}
