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
import { COMPOSER, COMPOSER_INPUT } from "../decks/formParts";
import { Button } from "../kit/Button";
import { IconClose } from "../kit/icons";
import { Spinner } from "../kit/Spinner";

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
    <aside className="flex min-h-0 flex-1 flex-col" aria-label="Ask AI about this slide">
      <header className="flex shrink-0 items-start justify-between gap-3 border-0 border-b border-card-border px-4 py-3">
        <div className="min-w-0">
          <b className="block text-sm font-semibold text-gray-900">Ask AI</b>
          <span className="block truncate text-xs text-gray-500" title={`Slide ${n} · ${slideTitle}`}>Slide {n} · {slideTitle}</span>
        </div>
        <button type="button" onClick={onClose} title="Hide" aria-label="Hide Ask AI"
          className="-mr-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-palette-600 max-md:h-11 max-md:w-11"><IconClose size={16} /></button>
      </header>
      <div className="flex min-h-45 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
        {thread.length === 0 && (
          <p className="rounded-2xl border border-card-border bg-gray-50 px-3.5 py-3 text-xs leading-relaxed text-gray-600">
            Ask anything about the slide on screen. CeMO answers from this report and, when it needs more, from the data for {week}, with the posts behind it.
          </p>
        )}
        {thread.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex max-w-[92%] flex-col self-end rounded-2xl rounded-br-md border border-gray-200 bg-gray-100 px-3.5 py-2 text-sm leading-relaxed text-gray-900">
              <span className="text-[11px] font-semibold text-brand-palette-700">Slide {m.slide}</span>
              <span className="whitespace-pre-wrap wrap-break-word">{m.text}</span>
            </div>
          ) : (
            <div key={m.id} className="flex min-w-0 flex-col gap-3 text-sm leading-relaxed text-gray-800 [&_b]:font-semibold [&_b]:text-gray-900 [&_li]:pl-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
              {m.activity && <div className="flex min-h-8 items-center gap-2 text-sm text-gray-500" aria-live="polite"><Spinner />{m.activity}</div>}
              {m.text && <RichText text={m.text} onChip={(id) => setOpenEv((o) => (o?.msg === m.id && o.ids[0] === id ? null : { msg: m.id, ids: [id] }))} />}
              {m.ask && (
                <div className="flex flex-col gap-2.5 rounded-2xl border border-card-border bg-white p-3">
                  <p className="text-sm font-semibold text-gray-900">{m.ask.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {m.ask.options.map((o) => <Button key={o.value} size="sm" variant="outline" disabled={busy} onClick={() => send(o.label)}>{o.label}</Button>)}
                  </div>
                </div>
              )}
              {openEv?.msg === m.id && <EvidenceList items={openEv.ids.map((id) => m.evidence[id]).filter(Boolean)} title={`Evidence · ${openEv.ids.join(", ")}`} />}
              {!m.streaming && m.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">{m.tools.filter((t) => t.status === "ok" && (t.rows?.length ?? 0) > 0).map((t) => <span key={t.id} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">{t.title ?? "Analysis"} · {t.rows!.length} rows</span>)}</div>
              )}
              {m.error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{m.error}</p>}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <div className="shrink-0 p-3">
        <div className={COMPOSER}>
          <textarea value={text} placeholder={`Ask about slide ${n}…`} rows={2} aria-label={`Ask about slide ${n}`} className={COMPOSER_INPUT} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
          <div className="flex items-center justify-between gap-2">
            {conversationId
              ? <Link href={`/?c=${conversationId}`} className="px-1 text-xs font-semibold text-brand-palette-700 underline-offset-2 hover:underline">Open in Chats</Link>
              : <span className="px-1 text-xs text-gray-500">Enter to send</span>}
            <Button size="sm" className="min-w-20" disabled={busy || !text.trim()} onClick={() => send(text)}>{busy ? "Thinking…" : "Ask"}</Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
