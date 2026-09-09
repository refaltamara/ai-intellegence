"use client";
/**
 * The Chats screen (PRD-v2 §2, §4): a conversation with CeMO on the left, the
 * evidence pane on the right once there is an object to show. Composer docked at
 * the bottom; thread above it with streaming text, activity lines, the one
 * clarifying question as tappable options, evidence chips, one-line object strips
 * that open the pane, counter blocks and follow-up chips. Acting on the pane
 * (excluding rows, changing filters) is a message to the model.
 */
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatEvent } from "@/chat/loop";
import type { MessageRow, ToolCallRecord } from "@/chat/persist";
import { splitCounters, type Followup } from "../chat/stream";
import { paneOf, type PaneAction, type PaneState } from "../chat/pane";
import type { Evidence } from "@/skills/types";
import { FileChip, Pane, usePaneRatio, type PaneObject } from "./Pane";
import type { PaneContext } from "./paneContext";
import { EvidencePanel, ResultCard } from "./ResultCard";

export type Attachment = { id: string; filename: string; bytes: number };
type Ask = { question: string; options: { label: string; value: string }[]; why: string; answered?: string };
type Msg = {
  id: string; role: "user" | "assistant"; text: string; tools: ToolCallRecord[]; evidence: Record<string, Evidence>;
  attachments?: Attachment[]; ask?: Ask; followups?: Followup[]; activity?: { text: string; done: boolean };
  hidden?: boolean;
  streaming?: boolean; status?: string; error?: string; miss?: number;
  timings?: { total_ms: number; model_ms: number; model_calls: number; tools_ms: number; tool_calls: number; setup_ms: number; effort: string };
};

const SUGGESTED = ["What were competitors doing last week?", "Tell me Skintific's strategy in June", "Which campaigns ran in the last 90 days with 20 or more creators?", "Find 50 nano creators competitors used on TikTok in the last 90 days"];
const MAX_FILES = 3;
const MAX_TABS = 6;
function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Props = {
  initialConversation: string | null; initialMessages: MessageRow[]; prefill?: string;
  stats: { brands: number; platforms: number; months: number; freshness: string }; clientName: string | null;
  decisionId?: string | null; basePath?: string; initialSend?: { prompt: string; followup?: Followup }; topbar?: boolean;
  pane?: PaneContext;
};

export function Ask({ initialConversation, initialMessages, prefill, stats, clientName, decisionId = null, basePath = "/", initialSend, topbar = true, pane }: Props) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initialConversation);
  const [thread, setThread] = useState<Msg[]>(() => {
    const out: Msg[] = initialMessages.map((m) => ({ id: m.id, role: m.role, text: m.content_json?.text ?? "", tools: m.content_json?.tools ?? [], evidence: m.evidence_json ?? {}, attachments: m.content_json?.attachments, hidden: m.content_json?.hidden, ask: m.content_json?.ask ? { question: m.content_json.ask.question, options: m.content_json.ask.options, why: m.content_json.ask.why } : undefined, followups: m.content_json?.followups, error: m.content_json?.error }));
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
  const colsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (prefill) taRef.current?.focus(); }, [prefill]);

  // ---- the evidence pane: objects come from tool results; the newest opens on arrival
  const [closedTabs, setClosedTabs] = useState<Set<string>>(new Set());
  const objects = useMemo<PaneObject[]>(() => {
    const out: PaneObject[] = [];
    for (const m of thread) {
      if (m.role !== "assistant") continue;
      for (const t of m.tools) {
        if (t.replaces) { const i = out.findIndex((o) => o.tool.run_id === t.replaces); if (i >= 0) out.splice(i, 1); }
        const p = paneOf(t);
        if (!p || p.kind === "file" || closedTabs.has(t.id)) continue;
        out.push({ id: t.id, kind: p.kind, title: p.title, tool: t, evidence: m.evidence, messageId: m.id });
      }
    }
    return out.slice(-MAX_TABS);
  }, [thread, closedTabs]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ratio, setRatio] = usePaneRatio();
  const [paneStates, setPaneStates] = useState<Record<string, PaneState>>(pane?.paneStates ?? {});
  const saveTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // on a reload with objects in the thread, the pane starts open on the latest (wide screens only)
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || !objects.length) return;
    booted.current = true;
    setActiveId(objects[objects.length - 1].id);
    if (typeof window !== "undefined" && window.innerWidth > 1100) setPaneOpen(true);
  }, [objects]);
  const showObject = useCallback((id: string) => { setActiveId(id); setPaneOpen(true); }, []);
  const onState = useCallback((runId: string, state: PaneState) => {
    setPaneStates((s) => ({ ...s, [runId]: state }));
    clearTimeout(saveTimer.current[runId]);
    saveTimer.current[runId] = setTimeout(() => { void fetch(`/api/runs/${runId}/pane`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) }); }, 500);
  }, []);
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    const el = colsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev: MouseEvent) => setRatio((ev.clientX - rect.left) / rect.width);
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // a thread opened from a decision or a chip starts with its first message already sent
  const sentInitial = useRef(false);
  useEffect(() => {
    if (initialSend && !sentInitial.current && thread.length === 0) { sentInitial.current = true; void send(initialSend.prompt, initialSend.followup); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  /** One turn: a typed message, a tapped chip, or a pane action. Streams the reply into a new assistant message. */
  async function turn(userMsg: Msg, body: Record<string, unknown>) {
    setBusy(true);
    const aid = `a${Date.now()}`;
    setThread((t) => {
      // answering the open question closes it
      const last = t[t.length - 1];
      const closed = last?.ask && !last.ask.answered && !userMsg.hidden ? t.map((m, i) => (i === t.length - 1 ? { ...m, ask: { ...m.ask!, answered: userMsg.text } } : m)) : t;
      return [...closed, userMsg, { id: aid, role: "assistant", text: "", tools: [], evidence: {}, streaming: true, status: "Thinking…" }];
    });
    const update = (fn: (m: Msg) => Msg) => setThread((t) => t.map((m) => (m.id === aid ? fn(m) : m)));
    try {
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
          if (e.type === "conversation") { if (!conversationId) { setConversationId(e.id); window.history.replaceState(null, "", `${basePath}?c=${e.id}`); } }
          if (e.type === "text") update((m) => ({ ...m, text: m.text + e.text, status: undefined }));
          if (e.type === "tool_start") update((m) => ({ ...m, status: undefined }));
          if (e.type === "activity") update((m) => ({ ...m, activity: { text: e.text, done: e.done }, status: undefined }));
          if (e.type === "ask") update((m) => ({ ...m, ask: { question: e.question, options: e.options, why: e.why }, status: undefined }));
          if (e.type === "followups") update((m) => ({ ...m, followups: e.items }));
          if (e.type === "tool_result") {
            const ev = Object.fromEntries(e.evidence.map((x) => [x.id, x]));
            update((m) => ({ ...m, tools: [...m.tools, e.tool], evidence: { ...m.evidence, ...ev }, status: "Writing…" }));
          }
          if (e.type === "pane_open") showObject(e.tool_id);
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

  async function send(message: string, followup?: Followup) {
    const q = message.trim();
    if (!q || busy || uploading > 0) return;
    const sending = files;
    setText("");
    setFiles([]);
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: q, tools: [], evidence: {}, attachments: sending.length ? sending : undefined };
    await turn(userMsg, { message: q, conversation_id: conversationId, decision_id: decisionId, attachment_ids: sending.map((f) => f.id), ...(followup ? { followup: { label: followup.label, skill: followup.skill, params: followup.params } } : {}) });
  }

  /** A pane action is a hidden user turn; the server works out the numbers and the model phrases them. */
  async function act(action: PaneAction) {
    if (busy || !conversationId) return;
    if (action.action !== "set_params") {
      // exclusions apply locally at once; the server stores the same state
      setPaneStates((s) => {
        const cur = new Set(s[action.run_id]?.excluded ?? []);
        if (action.action === "exclude_rows") for (const id of action.ids ?? []) cur.add(id);
        if (action.action === "include_rows") for (const id of action.ids ?? []) cur.delete(id);
        if (action.action === "clear_exclusions") cur.clear();
        return { ...s, [action.run_id]: { ...(s[action.run_id] ?? {}), excluded: [...cur] } };
      });
    }
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: action.human, tools: [], evidence: {}, hidden: true };
    await turn(userMsg, { message: "", conversation_id: conversationId, decision_id: decisionId, pane_action: action });
  }
  function note(textLine: string) {
    setThread((t) => [...t, { id: `n${Date.now()}`, role: "user", text: textLine, tools: [], evidence: {}, hidden: true }]);
  }

  const empty = thread.length === 0;
  const lastAssistantId = [...thread].reverse().find((m) => m.role === "assistant")?.id;
  const split = paneOpen && objects.length > 0;
  const activeObject = objects.find((o) => o.id === activeId) ?? objects[objects.length - 1];
  return (
    <section className={`screen ask ${split ? "split" : ""} ${split && expanded ? "big" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); } }}>
      {topbar && (
        <div className="topbar">
          <div><h1>Chats</h1><span className="meta">{clientName ? `On the side of ${clientName}` : "Beauty · Indonesia"}</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!split && objects.length > 0 && <button className="btn sm" onClick={() => setPaneOpen(true)}>Open the evidence</button>}
            <span className="pill live">Data through {stats.freshness}</span>
            <span className="pill">{stats.brands} brands · {stats.platforms} platforms · {stats.months} months</span>
          </div>
        </div>
      )}

      <div className="cols" ref={colsRef} style={{ ["--thr" as string]: `${Math.round(ratio * 100)}%` }}>
        <div className="col">
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
                    m.hidden ? (
                      <div className="sysline" key={m.id}>{m.text}</div>
                    ) : (
                      <div className="msg-u" key={m.id}>
                        {m.attachments?.length ? (
                          <div className="files sent">{m.attachments.map((f) => <span className="file" key={f.id} title={f.filename}><b>PDF</b>{f.filename}</span>)}</div>
                        ) : null}
                        {m.text}
                      </div>
                    )
                  ) : (
                    <div className="msg-a" key={m.id}>
                      <div className="who">C</div>
                      <div className="ans">
                        {m.activity && (m.streaming || m.tools.length === 0) && (
                          <div className={`activity ${m.activity.done ? "done" : ""}`}><span className="dot" />{m.activity.text}</div>
                        )}
                        {m.status && !m.activity && <div className="status">{m.status}</div>}
                        {m.text && <RichText text={m.text} onChip={(id) => setOpen((o) => ({ ...o, [m.id]: o[m.id]?.[0] === id && o[m.id].length === 1 ? [] : [id] }))} />}
                        {m.tools.map((t) =>
                          t.name === "export_run" && t.file ? (
                            <FileChip key={t.id} tool={t} conversationId={conversationId} />
                          ) : (
                            <ResultCard key={t.id} tool={t} evidence={m.evidence} decisionId={decisionId} onOpenEvidence={(ids) => setOpen((o) => ({ ...o, [m.id]: ids }))} onOpenPane={objects.some((o) => o.id === t.id) ? () => showObject(t.id) : undefined} />
                          ),
                        )}
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
                              const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skill_run_id: run.run_id, decision_id: decisionId }) });
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
        </div>

        {split && <div className="divider" onMouseDown={startDrag} role="separator" aria-orientation="vertical" />}
        {split && activeObject && (
          <Pane
            objects={objects} activeId={activeObject.id} onSelect={setActiveId} onClose={() => setPaneOpen(false)}
            onCloseTab={(id) => setClosedTabs((s) => new Set([...s, id]))}
            states={paneStates} onState={onState} onAction={act} onNote={note} busy={busy}
            decisionId={decisionId} conversationId={conversationId} brands={pane?.brands ?? []} months={pane?.months ?? []}
            expanded={expanded} onExpand={() => setExpanded((x) => !x)} toast={showToast}
          />
        )}
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
