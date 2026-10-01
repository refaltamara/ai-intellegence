"use client";
/**
 * Ask AI beside a weekly report slide: a short conversation with CeMO about the slide on screen. Each
 * question carries which report and slide it is about; the answer is written to be said out loud.
 * The whole thread stays one conversation (it also appears in Chats), so follow-ups keep their context.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatEvent } from "@/chat/loop";
import type { ToolCallRecord } from "@/chat/persist";
import type { Evidence } from "@/skills/types";
import { RichText } from "../Ask";
import { EvidenceList } from "../Evidence";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  slide?: number;
  tools: ToolCallRecord[];
  evidence: Record<string, Evidence>;
  activity?: string;
  streaming?: boolean;
  error?: string;
  ask?: { question: string; options: { label: string; value: string }[] };
};

export function SlideAsk({ reportId, n, slideTitle, week, onClose }: { reportId: string; n: number; slideTitle: string; week: string; onClose: () => void }) {
  const [thread, setThread] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [openEv, setOpenEv] = useState<{ msg: string; ids: string[] } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [thread]);

  async function send(q: string) {
    const message = q.trim();
    if (!message || busy) return;
    setText("");
    setBusy(true);
    const aid = `a${Date.now()}`;
    setThread((t) => [...t, { id: `u${Date.now()}`, role: "user", text: message, slide: n, tools: [], evidence: {} }, { id: aid, role: "assistant", text: "", tools: [], evidence: {}, streaming: true, activity: "Reading the slide…" }]);
    const update = (fn: (m: Msg) => Msg) => setThread((t) => t.map((m) => (m.id === aid ? fn(m) : m)));
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, conversation_id: conversationId, slide: { report_id: reportId, n } }) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
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
          if (e.type === "conversation") setConversationId(e.id);
          if (e.type === "text") update((m) => ({ ...m, text: m.text + e.text, activity: undefined }));
          if (e.type === "activity") update((m) => ({ ...m, activity: e.done ? undefined : e.text }));
          if (e.type === "tool_result") update((m) => ({ ...m, tools: [...m.tools, e.tool], evidence: { ...m.evidence, ...Object.fromEntries(e.evidence.map((x) => [x.id, x])) }, activity: "Writing the answer…" }));
          if (e.type === "ask") update((m) => ({ ...m, ask: { question: e.question, options: e.options }, activity: undefined }));
          if (e.type === "done") update((m) => ({ ...m, streaming: false, activity: undefined, evidence: { ...m.evidence, ...e.evidence } }));
          if (e.type === "error") update((m) => ({ ...m, error: e.message, streaming: false, activity: undefined }));
        }
      }
    } catch (err) {
      update((m) => ({ ...m, error: (err as Error).message, streaming: false, activity: undefined }));
    } finally {
      update((m) => ({ ...m, streaming: false, activity: undefined }));
      setBusy(false);
    }
  }

  return (
    <aside className="wk-ask" aria-label="Ask AI about this slide">
      <header>
        <div>
          <b>Ask AI</b>
          <span>Slide {n} · {slideTitle}</span>
        </div>
        <button className="x" onClick={onClose} title="Hide" aria-label="Hide Ask AI">×</button>
      </header>
      <div className="wk-thread">
        {thread.length === 0 && (
          <div className="wk-hint">
            Ask anything about the slide on screen. CeMO answers from this report and, when it needs more, from the data for {week}, with the posts behind it.
          </div>
        )}
        {thread.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="wk-q"><span className="tag">Slide {m.slide}</span>{m.text}</div>
          ) : (
            <div key={m.id} className="wk-a">
              {m.activity && <div className="activity"><span className="dot" />{m.activity}</div>}
              {m.text && <RichText text={m.text} onChip={(id) => setOpenEv((o) => (o?.msg === m.id && o.ids[0] === id ? null : { msg: m.id, ids: [id] }))} />}
              {m.ask && (
                <div className="wk-opts">
                  <p>{m.ask.question}</p>
                  {m.ask.options.map((o) => <button key={o.value} className="btn sm" disabled={busy} onClick={() => send(o.label)}>{o.label}</button>)}
                </div>
              )}
              {openEv?.msg === m.id && <EvidenceList items={openEv.ids.map((id) => m.evidence[id]).filter(Boolean)} title={`Evidence · ${openEv.ids.join(", ")}`} />}
              {!m.streaming && m.tools.length > 0 && (
                <div className="wk-tools">{m.tools.filter((t) => t.status === "ok" && (t.rows?.length ?? 0) > 0).map((t) => <span key={t.id}>{t.title ?? "Analysis"} · {t.rows!.length} rows</span>)}</div>
              )}
              {m.error && <div className="errbox">{m.error}</div>}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <div className="wk-compose">
        <textarea value={text} placeholder={`Ask about slide ${n}…`} rows={2} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
        <div className="row">
          {conversationId ? <Link href={`/?c=${conversationId}`} className="muted">Open in Chats</Link> : <span className="muted">Enter to send</span>}
          <button className="btn pri sm" disabled={busy || !text.trim()} onClick={() => send(text)}>{busy ? "Thinking…" : "Ask"}</button>
        </div>
      </div>
    </aside>
  );
}
