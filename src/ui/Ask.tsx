"use client";
/** The Ask screen (PRD §5.6): composer with slash menu, thread with streaming text, evidence chips, result cards, action row. */
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatEvent } from "@/chat/loop";
import type { MessageRow, ToolCallRecord } from "@/chat/persist";
import type { Evidence } from "@/skills/types";
import { EvidencePanel, ResultCard } from "./ResultCard";

export type SkillMeta = { name: string; layer: string; title: string; description: string; first_release?: boolean; available: boolean };
type Msg = { id: string; role: "user" | "assistant"; text: string; tools: ToolCallRecord[]; evidence: Record<string, Evidence>; streaming?: boolean; status?: string; error?: string; miss?: number };

const SUGGESTED = ["What were competitors doing last week?", "Tell me Skintific's strategy in June", "Most performing content with affiliate tags last month", "Is any competitor running a launch wave right now?"];

export function Ask({ skills, layers, initialConversation, initialMessages, prefill, stats }: { skills: SkillMeta[]; layers: Record<string, string>; initialConversation: string | null; initialMessages: MessageRow[]; prefill?: string; stats: { brands: number; platforms: number; months: number; freshness: string } }) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initialConversation);
  const [thread, setThread] = useState<Msg[]>(() => initialMessages.map((m) => ({ id: m.id, role: m.role, text: m.content_json?.text ?? "", tools: m.content_json?.tools ?? [], evidence: m.evidence_json ?? {}, error: m.content_json?.error })));
  const [text, setText] = useState(prefill ?? "");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (prefill) taRef.current?.focus(); }, [prefill]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread.length, busy]);

  const slashQuery = text.startsWith("/") && !text.includes(" ") ? text.slice(1).toLowerCase() : null;
  const slashItems = slashQuery != null ? skills.filter((s) => s.name.startsWith(slashQuery)) : [];

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(""), 2200); }

  async function send(message: string) {
    const q = message.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: q, tools: [], evidence: {} };
    const aid = `a${Date.now()}`;
    setThread((t) => [...t, userMsg, { id: aid, role: "assistant", text: "", tools: [], evidence: {}, streaming: true, status: "Thinking…" }]);
    const update = (fn: (m: Msg) => Msg) => setThread((t) => t.map((m) => (m.id === aid ? fn(m) : m)));
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, conversation_id: conversationId }) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let discoveryRun: string | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const e = JSON.parse(line.slice(6)) as ChatEvent;
          if (e.type === "conversation") { if (!conversationId) { setConversationId(e.id); window.history.replaceState(null, "", `/?c=${e.id}`); } }
          if (e.type === "text") update((m) => ({ ...m, text: m.text + e.text, status: undefined }));
          if (e.type === "tool_start") update((m) => ({ ...m, status: `Running ${e.name === "run_skill" ? "/" + String((e.input as any)?.skill ?? "skill") : e.name}…` }));
          if (e.type === "tool_result") {
            const ev = Object.fromEntries(e.evidence.map((x) => [x.id, x]));
            update((m) => ({ ...m, tools: [...m.tools, e.tool], evidence: { ...m.evidence, ...ev }, status: "Writing…" }));
            if (e.tool.skill === "discovery" && e.tool.run_id && q.toLowerCase().startsWith("/discovery")) discoveryRun = e.tool.run_id;
          }
          if (e.type === "done") update((m) => ({ ...m, id: e.message_id, evidence: { ...m.evidence, ...e.evidence }, streaming: false, status: undefined, miss: e.evidence_miss }));
          if (e.type === "error") update((m) => ({ ...m, error: e.message, streaming: false, status: undefined }));
        }
      }
      if (discoveryRun) router.push(`/skills/discovery?run=${discoveryRun}`);
    } catch (err) {
      update((m) => ({ ...m, error: (err as Error).message, streaming: false, status: undefined }));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const empty = thread.length === 0;
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Ask</h1><span className="meta">Beauty · Indonesia</span></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="pill live">Data through {stats.freshness}</span>
          <span className="pill">{stats.brands} brands · {stats.platforms} platforms · {stats.months} months</span>
        </div>
      </div>
      <div className="wrap">
        <div className="hero">
          {empty && <><h2>What's happening in Indonesian beauty?</h2><p>Every answer is built from the posts we collected across {stats.brands} brands on TikTok and Instagram. Nothing is guessed, and every number shows its evidence.</p></>}
          <div className="composer">
            <textarea ref={taRef} value={text} placeholder="Ask anything, or type / to use a skill…" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } if (e.key === "Escape") setText(""); }} />
            <div className="row"><span><kbd>/</kbd> for skills · Enter to send · Shift+Enter for a new line</span><button className="btn pri sm" disabled={busy} onClick={() => send(text)}>{busy ? "Working…" : "Ask"}</button></div>
            <div className={`slashmenu ${slashQuery != null ? "on" : ""}`}>
              {slashItems.length === 0 && <div className="g">No skill matches "/{slashQuery}"</div>}
              {Object.keys(layers).map((layer) => {
                const items = slashItems.filter((s) => s.layer === layer);
                if (!items.length) return null;
                return (
                  <Fragment key={layer}>
                    <div className="g">{layers[layer]}</div>
                    {items.map((s) => (
                      <button key={s.name} onClick={() => { setText(`/${s.name} `); taRef.current?.focus(); }} className={s.available ? "" : "off"}>
                        <b>/{s.name}</b><span>{s.description.split(". ")[0]}.{s.available ? "" : " (unavailable in v1)"}</span>
                      </button>
                    ))}
                  </Fragment>
                );
              })}
            </div>
          </div>
          {empty && (
            <div className="chips">
              <button className="skill" onClick={() => send("/discovery 50 nano creators competitors used on TikTok in the last 90 days")}>/discovery 50 nano creators competitors used on TikTok</button>
              {SUGGESTED.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
        </div>

        <div className="thread">
          {thread.map((m) =>
            m.role === "user" ? (
              <div className="msg-u" key={m.id}>{m.text}</div>
            ) : (
              <div className="msg-a" key={m.id}>
                <div className="who">F</div>
                <div className="ans">
                  {m.tools.map((t) => (
                    <ResultCard key={t.id} tool={t} evidence={m.evidence} onOpenEvidence={(ids) => setOpen((o) => ({ ...o, [m.id]: ids }))} />
                  ))}
                  {m.status && <div className="status">{m.status}</div>}
                  {m.text && <RichText text={m.text} onChip={(id) => setOpen((o) => ({ ...o, [m.id]: o[m.id]?.[0] === id && o[m.id].length === 1 ? [] : [id] }))} />}
                  {open[m.id]?.length ? <EvidencePanel ids={open[m.id]} evidence={m.evidence} title={`Evidence · ${open[m.id].join(", ")}`} /> : null}
                  {m.error && <div className="errbox">{m.error}</div>}
                  {!m.streaming && !m.error && !m.text && m.tools.length === 0 && <div className="errbox">This answer was cut off before it finished (the server did not save a reply). Ask again in a new conversation.</div>}
                  {!m.streaming && !m.error && m.text && (
                    <div className="acts">
                      <button className="btn sm" onClick={() => send("Get this every Monday")}>Get this every Monday</button>
                      <button className="btn sm" disabled={!m.tools.some((t) => t.run_id)} title={m.tools.some((t) => t.run_id) ? "" : "No skill run in this answer"} onClick={async () => {
                        const run = [...m.tools].reverse().find((t) => t.run_id);
                        if (!run) return;
                        showToast("Writing the report…");
                        const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_run_id: run.run_id }) });
                        const j = await r.json();
                        if (j.error) { showToast(j.error); return; }
                        router.push(`/reports/${j.id}`);
                      }}>Turn into a report</button>
                      <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(m.text.replace(/<ev id="(ev_\d+)"><\/ev>/g, "[$1]")); showToast("Copied"); }}>Copy</button>
                      {m.miss ? <span className="pill" title="citations the model made to evidence that does not exist were removed">evidence_miss {m.miss}</span> : null}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </section>
  );
}

/** Renders assistant text: paragraphs, "- " bullets, **bold**, and <ev id> chips. */
export function RichText({ text, onChip }: { text: string; onChip?: (id: string) => void }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const isList = lines.every((l) => /^\s*[-•*]\s+/.test(l));
        if (isList) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""), onChip)}</li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, onChip)}</Fragment>)}</p>;
      })}
    </>
  );
}

function inline(s: string, onChip?: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<ev id="(ev_\d+)"><\/ev>|\*\*(.+?)\*\*/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<span key={k++} className="ev" onClick={() => onChip?.(m![1])} title={m[1]}>{m[1].replace("ev_", "")}</span>);
    else out.push(<b key={k++}>{m[2]}</b>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
