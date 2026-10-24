"use client";
/**
 * CeMO's rules and memory, added by hand (CMS plan, "CeMO memory and house rules"): a house
 * rule, a fact to remember, or a word the team uses. A Builder's is live at once; a
 * Member's goes to the Builder. The server refuses a rule that would have CeMO compute,
 * invent or drop evidence, and says why.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "../cn";
import { Button } from "../kit/Button";
import { Field, TextField } from "../kit/Form";
import { Segmented } from "../kit/Segmented";

const HINT = {
  rule: "Never draft anything about OJK or Bank Indonesia without saying Legal must review",
  fact: "Our fiscal month starts on the 26th",
  term: "",
};

const KINDS = [
  { key: "rule" as const, label: "House rule" },
  { key: "fact" as const, label: "Something to remember" },
  { key: "term" as const, label: "A word we use" },
];

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
    <div className="flex flex-col gap-3 rounded-2xl bg-gray-50 p-4">
      <Segmented size="sm" label="What to add" options={KINDS} value={kind} onChange={setKind} />
      {kind === "term" ? (
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="Say"><TextField value={say} onChange={(e) => setSay(e.target.value)} placeholder="isu" maxLength={40} /></Field>
          <span className="pb-2.5 text-sm text-gray-500">not</span>
          <Field label="Instead of"><TextField value={not} onChange={(e) => setNot(e.target.value)} placeholder="issue" maxLength={40} /></Field>
        </div>
      ) : (
        <textarea aria-label={kind === "rule" ? "House rule" : "Something to remember"} value={text} onChange={(e) => setText(e.target.value)} placeholder={HINT[kind]} maxLength={300} rows={2}
          className="block w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 font-sans text-sm leading-relaxed text-gray-900 outline-none transition-all duration-200 placeholder:text-gray-500 focus:border-brand-palette-600 focus:ring-2 focus:ring-brand-palette-500/15" />
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {msg && <small role={msg.ok ? "status" : "alert"} className={cn("text-xs", msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</small>}
        <Button size="sm" isLoading={busy} disabled={kind === "term" ? !say.trim() || !not.trim() : !text.trim()} onClick={save}>{builder ? "Add for everyone" : "Send to your Builder"}</Button>
      </div>
    </div>
  );
}
