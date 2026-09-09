"use client";
/**
 * The Ask screen (PRD-v2 §2, §4): a conversation with CeMO. Composer docked at the
 * bottom; thread above it with streaming text, activity lines, the one clarifying
 * question as tappable options, evidence chips, result cards, counter blocks and
 * follow-up chips. No slash menu: the person never types a command.
 */
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatEvent } from "@/chat/loop";
import type { MessageRow, ToolCallRecord } from "@/chat/persist";
import { splitCounters, type Followup } from "../chat/stream";
import type { Evidence } from "@/skills/types";
import { EvidencePanel, ResultCard } from "./ResultCard";

export type Attachment = { id: string; filename: string; bytes: number };
type Ask = { question: string; options: { label: string; value: string }[]; why: string; answered?: string };
type Msg = {
  id: string; role: "user" | "assistant"; text: string; tools: ToolCallRecord[]; evidence: Record<string, Evidence>;
  attachments?: Attachment[]; ask?: Ask; followups?: Followup[]; activity?: { text: string; done: boolean };
  streaming?: boolean; status?: string; error?: string; miss?: number;
  timings?: { total_ms: number; model_ms: number; model_calls: number; tools_ms: number; tool_calls: number; setup_ms: number; effort: string };
};

const SUGGESTED = ["What were competitors doing last week?", "Tell me Skintific's strategy in June", "Which campaigns ran in the last 90 days with 20 or more creators?", "Find 50 nano creators competitors used on TikTok in the last 90 days"];
const MAX_FILES = 3;
function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function Ask({ initialConversation, initialMessages, prefill, stats, clientName }: { initialConversation: string | null; initialMessages: MessageRow[]; prefill?: string; stats: { brands: number; platforms: number; months: number; freshness: string }; clientName: string | null }) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initialConversation);
  const [thread, setThread] = useState<Msg[]>(() => {
    const out: Msg[] = initialMessages.map((m) => ({ id: m.id, role: m.role, text: m.content_json?.text ?? "", tools: m.content_json?.tools ?? [], evidence: m.evidence_json ?? {}, attachments: m.content_json?.attachments, ask: m.content_json?.ask ? { question: m.content_json.ask.question, options: m.content_json.ask.options, why: m.content_json.ask.why } : undefined, followups: m.content_json?.followups, error: m.content_json?.error }));
    // a question that already has a reply after it is answered
    for (let i = 0; i < out.length - 1; i++) if (out[i].ask && out[i + 1].role === "user") out[i].ask!.answered = out[i + 1].text;
    return out;
  });
  const [text, setText] = useState(prefill ?? "");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (prefill) taRef.current?.focus(); }, [prefill]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread.length, busy]);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(""), 3200); }

  async function upload(list: FileList | File[]) {
    const picked = Array.from(list).slice(0, Math.max(0, MAX_FILES - files.length));
    if (!picked.length) { showToast(`Up to ${MAX_FILES} documents per message`); return; }
    for (const f of picked) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/uploads", { method: "POST", body: fd });
        const j = await r.json();
        if (j.error) showToast(j.error);
        else setFiles((cur) => (cur.some((x) => x.id === j.id) ? cur : [...cur, { id: j.id, filename: j.filename, bytes: j.bytes }]));
      } catch (e) {
        showToast(`Upload failed: ${(e as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removeFile(id: string) {
    setFiles((cur) => cur.filter((f) => f.id !== id));
    void fetch(`/api/uploads?id=${id}`, { method: "DELETE" });
  }

  async function send(message: string, followup?: Followup) {
    const q = message.trim();
    if (!q || busy || uploading > 0) return;
    const sending = files;
    setText("");
    setFiles([]);
    setBusy(true);
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: q, tools: [], evidence: {}, attachments: sending.length ? sending : undefined };
    const aid = `a${Date.now()}`;
    setThread((t) => {
      // answering the open question closes it
      const last = t[t.length - 1];
      const closed = last?.ask && !last.ask.answered ? t.map((m, i) => (i === t.length - 1 ? { ...m, ask: { ...m.ask!, answered: q } } : m)) : t;
      return [...closed, userMsg, { id: aid, role: "assistant", text: "", tools: [], evidence: {}, streaming: true, status: "Thinking…" }];
    });
    const update = (fn: (m: Msg) => Msg) => setThread((t) => t.map((m) => (m.id === aid ? fn(m) : m)));
    try {
      const body = { message: q, conversation_id: conversationId, attachment_ids: sending.map((f) => f.id), ...(followup ? { followup: { label: followup.label, skill: followup.skill, params: followup.params } } : {}) };
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
          if (e.type === "conversation") { if (!conversationId) { setConversationId(e.id); window.history.replaceState(null, "", `/?c=${e.id}`); } }
          if (e.type === "text") update((m) => ({ ...m, text: m.text + e.text, status: undefined }));
          if (e.type === "tool_start") update((m) => ({ ...m, status: undefined }));
          if (e.type === "activity") update((m) => ({ ...m, activity: { text: e.text, done: e.done }, status: undefined }));
          if (e.type === "ask") update((m) => ({ ...m, ask: { question: e.question, options: e.options, why: e.why }, status: undefined }));
          if (e.type === "followups") update((m) => ({ ...m, followups: e.items }));
          if (e.type === "tool_result") {
            const ev = Object.fromEntries(e.evidence.map((x) => [x.id, x]));
            update((m) => ({ ...m, tools: [...m.tools, e.tool], evidence: { ...m.evidence, ...ev }, status: "Writing…" }));
          }
          if (e.type === "done") update((m) => ({ ...m, id: e.message_id, evidence: { ...m.evidence, ...e.evidence }, streaming: false, status: undefined, miss: e.evidence_miss, timings: e.timings, activity: m.activity ? { ...m.activity, done: true } : undefined }));
          if (e.type === "error") update((m) => ({ ...m, error: e.message, streaming: false, status: undefined }));
        }
      }
    } catch (err) {
      update((m) => ({ ...m, error: (err as Error).message, streaming: false, status: undefined }));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const empty = thread.length === 0;
  const lastAssistantId = [...thread].reverse().find((m) => m.role === "assistant")?.id;
  return (
    <section className="screen ask"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); } }}>
      <div className="topbar">
        <div><h1>Ask CeMO</h1><span className="meta">{clientName ? `On the side of ${clientName}` : "Beauty · Indonesia"}</span></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="pill live">Data through {stats.freshness}</span>
          <span className="pill">{stats.brands} brands · {stats.platforms} platforms · {stats.months} months</span>
        </div>
      </div>

      <div className={`feed ${empty ? "start" : ""}`}>
        <div className="wrap">
          {empty && (
            <div className="hero">
              <h2>What's happening in Indonesian beauty?</h2>
              <p>I've read every creator post about {stats.brands} brands on TikTok and Instagram. Ask me anything about creators, competitors or campaigns; every number I give you shows its evidence, and I'll tell you when the data disagrees with you.</p>
              <div className="chips">
                {SUGGESTED.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          <div className="thread">
            {thread.map((m) =>
              m.role === "user" ? (
                <div className="msg-u" key={m.id}>
                  {m.attachments?.length ? (
                    <div className="files sent">{m.attachments.map((f) => <span className="file" key={f.id} title={f.filename}><b>PDF</b>{f.filename}</span>)}</div>
                  ) : null}
                  {m.text}
                </div>
              ) : (
                <div className="msg-a" key={m.id}>
                  <div className="who">C</div>
                  <div className="ans">
                    {m.activity && (m.streaming || m.tools.length === 0) && (
                      <div className={`activity ${m.activity.done ? "done" : ""}`}><span className="dot" />{m.activity.text}</div>
                    )}
                    {m.tools.map((t) => (
                      <ResultCard key={t.id} tool={t} evidence={m.evidence} onOpenEvidence={(ids) => setOpen((o) => ({ ...o, [m.id]: ids }))} />
                    ))}
                    {m.status && !m.activity && <div className="status">{m.status}</div>}
                    {m.text && <RichText text={m.text} onChip={(id) => setOpen((o) => ({ ...o, [m.id]: o[m.id]?.[0] === id && o[m.id].length === 1 ? [] : [id] }))} />}
                    {m.ask && (
                      <div className={`ask-card ${m.ask.answered ? "done" : ""}`}>
                        <div className="q">{m.ask.question}</div>
                        {m.ask.why && <div className="why">{m.ask.why}</div>}
                        <div className="opts">
                          {m.ask.options.map((o) => (
                            <button key={o.value} className={m.ask!.answered === o.value || m.ask!.answered === o.label ? "picked" : ""} onClick={() => send(o.label)} disabled={busy}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {open[m.id]?.length ? <EvidencePanel ids={open[m.id]} evidence={m.evidence} title={`Evidence · ${open[m.id].join(", ")}`} /> : null}
                    {m.error && <div className="errbox">{m.error}</div>}
                    {!m.streaming && !m.error && !m.text && !m.ask && m.tools.length === 0 && <div className="errbox">This answer was cut off before it finished (the server did not save a reply). Ask again in a new conversation.</div>}
                    {!m.streaming && m.followups?.length && m.id === lastAssistantId && !busy ? (
                      <div className="follow">{m.followups.map((f) => <button key={f.label} onClick={() => send(f.prompt, f)}>{f.label}</button>)}</div>
                    ) : null}
                    {!m.streaming && !m.error && m.text && !m.ask && (
                      <div className="acts">
                        <button className="btn sm" onClick={() => send("Watch this every Monday and only tell me when something changes")}>Watch this weekly</button>
                        <button className="btn sm" disabled={!m.tools.some((t) => t.run_id)} title={m.tools.some((t) => t.run_id) ? "" : "Nothing to report on yet"} onClick={async () => {
                          const run = [...m.tools].reverse().find((t) => t.run_id);
                          if (!run) return;
                          showToast("Writing the report…");
                          const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_run_id: run.run_id }) });
                          const j = await r.json();
                          if (j.error) { showToast(j.error); return; }
                          router.push(`/reports/${j.id}`);
                        }}>Turn into a report</button>
                        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(m.text.replace(/<ev id="(ev_\d+)"><\/ev>/g, "[$1]").replace(/<\/?counter>/g, "")); showToast("Copied"); }}>Copy</button>
                        {m.miss ? <span className="pill" title="citations to evidence that does not exist were removed">evidence_miss {m.miss}</span> : null}
                        {m.timings && <span className="pill" title={`setup ${m.timings.setup_ms} ms · effort ${m.timings.effort}`}>{(m.timings.total_ms / 1000).toFixed(1)}s</span>}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      <div className="dock">
        <div className="wrap">
          <div className="composer">
            {(files.length > 0 || uploading > 0) && (
              <div className="files">
                {files.map((f) => (
                  <span className="file" key={f.id} title={f.filename}>
                    <b>PDF</b>{f.filename}<small>{fileSize(f.bytes)}</small>
                    <i onClick={() => removeFile(f.id)} title="Remove">×</i>
                  </span>
                ))}
                {uploading > 0 && <span className="file busy">Uploading {uploading} file{uploading > 1 ? "s" : ""}…</span>}
              </div>
            )}
            <textarea ref={taRef} value={text} placeholder="Ask, or tell me what you're deciding…" onChange={(e) => setText(e.target.value)}
              onPaste={(e) => { const fs = Array.from(e.clipboardData.files ?? []); if (fs.length) { e.preventDefault(); void upload(fs); } }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } if (e.key === "Escape") setText(""); }} />
            <div className="row">
              <span className="tools">
                <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
                <button className="attach" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES} title={files.length >= MAX_FILES ? `Up to ${MAX_FILES} documents` : "Attach a PDF brief or deck"}>Attach PDF</button>
                <span>Enter to send · Shift+Enter for a new line</span>
              </span>
              <button className="btn pri sm" disabled={busy || uploading > 0} onClick={() => send(text)}>{busy ? "Working…" : "Ask"}</button>
            </div>
          </div>
        </div>
      </div>

      {dragging && <div className="dropzone" onDragLeave={() => setDragging(false)}><div>Drop a PDF brief or deck to add it to this conversation</div></div>}
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </section>
  );
}

const BULLET = /^\s*(?:[-•*]|\d+[.)])\s+/;

/** Split assistant text into paragraph and list groups. Consecutive bullet lines
 *  form one list wherever they appear, so a lead sentence followed straight by a
 *  list (no blank line between) still renders as a list, not literal dashes. */
export function textGroups(text: string): { list: boolean; lines: string[] }[] {
  const groups: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) { groups.push({ list: false, lines: [] }); continue; } // a blank line ends the current group
    const list = BULLET.test(raw);
    const last = groups[groups.length - 1];
    if (last?.lines.length && last.list === list) last.lines.push(list ? raw.replace(BULLET, "") : raw);
    else groups.push({ list, lines: [list ? raw.replace(BULLET, "") : raw] });
  }
  return groups.filter((g) => g.lines.length);
}

/** Renders assistant text: paragraphs, "- " bullets, **bold**, <ev id> chips, and <counter> blocks. */
export function RichText({ text, onChip }: { text: string; onChip?: (id: string) => void }) {
  return (
    <>
      {splitCounters(text).map((seg, si) =>
        seg.kind === "counter" ? (
          <div className="counter" key={si}>{textGroups(seg.text).map((g, i) => <Fragment key={i}>{g.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, onChip)}</Fragment>)}</Fragment>)}</div>
        ) : (
          <Fragment key={si}>
            {textGroups(seg.text).map((g, i) =>
              g.list ? (
                <ul key={i}>{g.lines.map((l, j) => <li key={j}>{inline(l, onChip)}</li>)}</ul>
              ) : (
                <p key={i}>{g.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, onChip)}</Fragment>)}</p>
              ),
            )}
          </Fragment>
        ),
      )}
    </>
  );
}

function inline(s: string, onChip?: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<ev id="(ev_\d+)"><\/ev>|\*\*(.+?)\*\*/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) {
      const id = m[1];
      // keep punctuation that follows a chip on the same line as the chip
      const tail = /^[,.;:!?)]+/.exec(s.slice(last))?.[0] ?? "";
      last += tail.length;
      out.push(
        <span key={k++} className={tail ? "nb tight" : "nb"}>
          <span className="ev" onClick={() => onChip?.(id)} title={id}>{id.replace("ev_", "")}</span>
          {tail}
        </span>,
      );
    } else out.push(<b key={k++}>{m[2]}</b>);
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
