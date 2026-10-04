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
import { matchSkills, SlashMenu, type SkillOption } from "./SlashMenu";
import { AskContextCard } from "./AskContextCard";
import type { AskContext, AskRef } from "@/dashboard/askref";

export type Attachment = { id: string; filename: string; bytes: number };
type Ask = { question: string; options: { label: string; value: string }[]; why: string; answered?: string };
type Msg = {
  id: string; role: "user" | "assistant"; text: string; tools: ToolCallRecord[]; evidence: Record<string, Evidence>;
  attachments?: Attachment[]; ask?: Ask; followups?: Followup[]; activity?: { text: string; done: boolean };
  hidden?: boolean;
  context?: AskContext;
  streaming?: boolean; status?: string; error?: string; miss?: number;
  timings?: { total_ms: number; model_ms: number; model_calls: number; tools_ms: number; tool_calls: number; setup_ms: number; effort: string };
};

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
  /** words from the workspace: what the empty screen says and offers */
  copy?: { hero_title: string; hero_intro: string; suggested: string[]; label: string; kind: string };
  /** what the "/" menu offers: the team's analyses, in plain words */
  skills?: SkillOption[];
  /** "Ask why" from the dashboard: the click, and the figures the server read for it */
  fromDashboard?: { ref: AskRef; context: AskContext } | null;
  /** the team's role (its codename on cards), and whether this person may switch Builder mode on */
  team?: { codename: string; builder: boolean } | null;
};

const DEFAULT_COPY = { hero_title: "What's happening in Indonesian beauty?", hero_intro: "", suggested: ["What were competitors doing last week?", "Which brand grew fastest this month?", "Which campaigns ran in the last 90 days with 20 or more creators?", "Find 50 nano creators competitors used on TikTok in the last 90 days"], label: "Beauty · Indonesia", kind: "category" };

export function Ask({ initialConversation, initialMessages, prefill, stats, clientName, decisionId = null, basePath = "/", initialSend, topbar = true, pane, copy = DEFAULT_COPY, skills = [], fromDashboard = null, team = null }: Props) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initialConversation);
  const [thread, setThread] = useState<Msg[]>(() => {
    const out: Msg[] = initialMessages.map((m) => ({ id: m.id, role: m.role, text: m.content_json?.text ?? "", tools: m.content_json?.tools ?? [], evidence: m.evidence_json ?? {}, attachments: m.content_json?.attachments, hidden: m.content_json?.hidden, context: m.content_json?.context, ask: m.content_json?.ask ? { question: m.content_json.ask.question, options: m.content_json.ask.options, why: m.content_json.ask.why } : undefined, followups: m.content_json?.followups, error: m.content_json?.error }));
    // a question that already has a reply after it is answered
    for (let i = 0; i < out.length - 1; i++) if (out[i].ask && out[i + 1].role === "user") out[i].ask!.answered = out[i + 1].text;
    return out;
  });
  const [text, setText] = useState(prefill ?? fromDashboard?.context.question ?? "");
  const [pendingAsk, setPendingAsk] = useState(fromDashboard);
  // Builder mode (CMS plan, The Builder): only a Builder sees the switch; the server checks again on every turn
  const [builderMode, setBuilderMode] = useState(false);
  useEffect(() => { try { if (team?.builder && localStorage.getItem("fi_builder_mode") === "1") setBuilderMode(true); } catch { /* storage off */ } }, [team?.builder]);
  function toggleBuilder() {
    setBuilderMode((on) => { try { localStorage.setItem("fi_builder_mode", on ? "0" : "1"); } catch { /* storage off */ } return !on; });
  }
  const [busy, setBusy] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (prefill || fromDashboard) taRef.current?.focus(); }, [prefill, fromDashboard]);

  // ---- the "/" menu: typed "/" at the start of an empty box, or the + button
  const [plusOpen, setPlusOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const slashTyped = text.startsWith("/") && !text.includes("\n");
  const menuOpen = skills.length > 0 && focused && (slashTyped || plusOpen);
  const menuOptions = useMemo(() => (menuOpen ? matchSkills(skills, slashTyped ? text.slice(1) : "") : []), [menuOpen, skills, slashTyped, text]);
  useEffect(() => { setMenuIndex(0); }, [text, plusOpen]);
  function closeMenu() { setPlusOpen(false); if (slashTyped) setText(""); }
  function pickSkill(o: SkillOption) {
    setPlusOpen(false);
    setText(o.example);
    requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.focus(); ta.setSelectionRange(o.example.length, o.example.length); } });
  }
  function toggleMenu() {
    if (menuOpen) { closeMenu(); return; }
    if (!text.trim()) setText("/"); else setPlusOpen(true);
    taRef.current?.focus();
  }
  function menuKeys(e: React.KeyboardEvent): boolean {
    if (!menuOpen) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setMenuIndex((i) => Math.min(i + 1, Math.max(0, menuOptions.length - 1))); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((i) => Math.max(i - 1, 0)); return true; }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") { e.preventDefault(); const o = menuOptions[menuIndex]; if (o) pickSkill(o); return true; }
    if (e.key === "Escape") { e.preventDefault(); closeMenu(); return true; }
    return false;
  }

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
  // on a reload the pane stays closed until asked for; it remembers the latest object
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || !objects.length) return;
    booted.current = true;
    setActiveId(objects[objects.length - 1].id);
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
          // the pane opens when the person asks for it (the result card's button); a new result only switches an open pane
          if (e.type === "pane_open") setActiveId(e.tool_id);
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
    const asking = pendingAsk;
    setPendingAsk(null);
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: q, tools: [], evidence: {}, attachments: sending.length ? sending : undefined, context: asking?.context };
    await turn(userMsg, { message: q, conversation_id: conversationId, decision_id: decisionId, attachment_ids: sending.map((f) => f.id), ...(followup ? { followup: { label: followup.label, skill: followup.skill, params: followup.params } } : {}), ...(asking ? { ask: asking.ref } : {}), ...(builderMode && team?.builder ? { builder: true } : {}) });
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
  const split = paneOpen && objects.length > 0;
  const activeObject = objects.find((o) => o.id === activeId) ?? objects[objects.length - 1];
  return (
    <section className={`screen ask ${split ? "split" : ""} ${split && expanded ? "big" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); } }}>
      {topbar && (
        <div className="topbar">
          <div><h1>Chats</h1><span className="meta">{clientName ? (copy.kind === "profile" ? `About ${clientName}` : `On the side of ${clientName}`) : copy.label}</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!split && objects.length > 0 && <button className="btn sm" onClick={() => setPaneOpen(true)}>Open the evidence</button>}
            <span className={`pill ${stats.freshness ? "live" : ""}`}>{stats.freshness ? `Data through ${stats.freshness}` : "No data loaded yet"}</span>
            <span className="pill">{copy.kind === "profile" ? `${stats.platforms} platforms · ${stats.months} months` : `${stats.brands} brands · ${stats.platforms} platforms · ${stats.months} months`}</span>
          </div>
        </div>
      )}

      <div className="cols" ref={colsRef} style={{ ["--thr" as string]: `${Math.round(ratio * 100)}%` }}>
        <div className="col">
          <div className={`feed ${empty ? "start" : ""}`}>
            <div className="wrap">
              {empty && (
                <div className="hero">
                  <h2>{copy.hero_title}</h2>
                  <p>{copy.hero_intro || `I've read every creator post about ${stats.brands} brands on TikTok and Instagram. Ask me anything about creators, competitors or campaigns; every number I give you shows its evidence, and I'll tell you when the data disagrees with you.`}</p>
                </div>
              )}
              <div className="thread">
                {thread.map((m) =>
                  m.role === "user" ? (
                    m.hidden ? (
                      <div className="sysline" key={m.id}>{m.text}</div>
                    ) : (
                      <Fragment key={m.id}>
                        {m.context && <AskContextCard c={m.context} sent />}
                        <div className="msg-u">
                          {m.attachments?.length ? (
                            <div className="files sent">{m.attachments.map((f) => <span className="file" key={f.id} title={f.filename}><b>PDF</b>{f.filename}</span>)}</div>
                          ) : null}
                          {m.text}
                        </div>
                      </Fragment>
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
                            <ResultCard key={t.id} tool={t} evidence={m.evidence} decisionId={decisionId} codename={team?.codename} onOpenEvidence={(ids) => setOpen((o) => ({ ...o, [m.id]: ids }))} onOpenPane={objects.some((o) => o.id === t.id) ? () => showObject(t.id) : undefined} />
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
                        {!m.streaming && !m.error && m.text && !m.ask && (
                          <div className="acts">
                            <button className="btn sm" onClick={() => send("Watch this every Monday and only tell me when something changes")}>Watch this weekly</button>
                            <button className="btn sm" disabled={!conversationId || busy} title="A report from this whole conversation: every question, answer, table and its evidence" onClick={async () => {
                              if (!conversationId) return;
                              showToast("Writing the report from this conversation…");
                              const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conversationId }) });
                              const j = await r.json();
                              if (j.error) { showToast(j.error); return; }
                              router.push(`/reports/${j.id}`);
                            }}>Turn into a report</button>
                            {copy.kind !== "profile" && (
                              <button className="btn sm" disabled={!conversationId || busy || deckBusy} title="A deck from this conversation: every analysis becomes a slide, run again for each version, next to a scoreboard and the moves" onClick={async () => {
                                if (!conversationId) return;
                                setDeckBusy(true);
                                showToast("Making the deck from this conversation… (about a minute)");
                                const r = await fetch("/api/decks/from-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conversationId }) });
                                const j = await r.json().catch(() => ({}));
                                setDeckBusy(false);
                                if (!r.ok || !j.deck) { showToast(j.error ?? "Could not make the deck"); return; }
                                router.push(`/decks/${j.deck.id}${j.version?.report_id ? `?v=${j.version.report_id}` : ""}`);
                              }}>{deckBusy ? "Making the deck…" : "Turn into a deck"}</button>
                            )}
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
              {pendingAsk && <AskContextCard c={pendingAsk.context} onRemove={() => setPendingAsk(null)} />}
              <div className={`composer ${builderMode && team?.builder ? "building" : ""}`}>
                {builderMode && team?.builder && <div className="buildbar">Builder mode · what you change here applies to everyone on {team.codename}, after you press Apply</div>}
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
                {menuOpen && <SlashMenu options={menuOptions} index={menuIndex} onPick={pickSkill} onHover={setMenuIndex} />}
                <textarea ref={taRef} value={text} placeholder="Ask CeMO anything, or type / to see what it can do" onChange={(e) => setText(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setPlusOpen(false); }}
                  onPaste={(e) => { const fs = Array.from(e.clipboardData.files ?? []); if (fs.length) { e.preventDefault(); void upload(fs); } }}
                  onKeyDown={(e) => { if (menuKeys(e)) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } if (e.key === "Escape") setText(""); }} />
                <div className="row">
                  <span className="tools">
                    {skills.length > 0 && <button type="button" className={`plus ${menuOpen ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={toggleMenu} title="What CeMO can do" aria-label="What CeMO can do" aria-expanded={menuOpen}>+</button>}
                    <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
                    <button className="attach" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES} title={files.length >= MAX_FILES ? `Up to ${MAX_FILES} documents` : "Attach a PDF brief or deck"}>Attach PDF</button>
                    {team?.builder && <button type="button" className={`buildswitch ${builderMode ? "on" : ""}`} onClick={toggleBuilder} role="switch" aria-checked={builderMode} title="Shape the team's version by asking CeMO">Builder mode</button>}
                    <span>Enter to send · / for what CeMO can do</span>
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
            expanded={expanded} onExpand={() => setExpanded((x) => !x)} toast={showToast} kind={copy.kind}
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

/** Renders assistant text: paragraphs, "- " bullets, **bold** and <ev id> chips. A <counter> block from older answers reads as plain text. */
export function RichText({ text, onChip }: { text: string; onChip?: (id: string) => void }) {
  return (
    <>
      {splitCounters(text).map((seg, si) =>
        seg.kind === "counter" ? (
          <p key={si}>{textGroups(seg.text).map((g, i) => <Fragment key={i}>{g.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, onChip)}</Fragment>)}</Fragment>)}</p>
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
