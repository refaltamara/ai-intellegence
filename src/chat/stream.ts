/**
 * The streamed answer, filtered on its way to the client.
 *
 * Three things ride inside the model's text and must survive chunk boundaries:
 *   [ev_03]                   evidence citations → <ev id="ev_03"></ev> (or dropped when unknown)
 *   <counter>…</counter>      the pushback block; kept in the text, rendered by the UI
 *   <followups>[…]</followups> the next questions; never shown as text, parsed at the end
 *
 * The stream holds back any trailing fragment that could be the start of one of these
 * so a tag or a citation is never split, and swallows the followups block entirely.
 */
import { rewriteCitations } from "./evidence";

export type Followup = { label: string; prompt: string; skill: string; params?: Record<string, unknown> };

const FOLLOW_OPEN = "<followups>";
const FOLLOW_CLOSE = "</followups>";
const MAX_LABEL = 48;

export class AnswerStream {
  private buf = "";
  private inFollowups = false;
  private followRaw = "";
  public miss: string[] = [];
  public cited: string[] = [];
  public followups: Followup[] = [];
  public hasCounter = false;

  constructor(public known: Set<string>) {}

  push(delta: string): string {
    this.buf += delta;
    let out = "";
    while (true) {
      if (this.inFollowups) {
        const end = this.buf.indexOf(FOLLOW_CLOSE);
        if (end < 0) { this.followRaw += this.buf; this.buf = ""; return out; }
        this.followRaw += this.buf.slice(0, end);
        this.buf = this.buf.slice(end + FOLLOW_CLOSE.length);
        this.inFollowups = false;
        this.parseFollowups();
        continue;
      }
      const open = this.buf.indexOf(FOLLOW_OPEN);
      if (open >= 0) {
        out += this.emit(this.buf.slice(0, open));
        this.buf = this.buf.slice(open + FOLLOW_OPEN.length);
        this.inFollowups = true;
        this.followRaw = "";
        continue;
      }
      // hold back a trailing partial citation or partial tag
      const safe = this.safeLength();
      out += this.emit(this.buf.slice(0, safe));
      this.buf = this.buf.slice(safe);
      return out;
    }
  }

  flush(): string {
    let out = "";
    if (this.inFollowups) {
      // unterminated block: try to use what we have, show none of it
      this.followRaw += this.buf;
      this.buf = "";
      this.inFollowups = false;
      this.parseFollowups();
    }
    out += this.emit(this.buf);
    this.buf = "";
    return out;
  }

  private safeLength(): number {
    const b = this.buf;
    let n = b.length;
    const bracket = b.lastIndexOf("[");
    if (bracket >= 0 && !b.slice(bracket).includes("]") && b.length - bracket < 48) n = Math.min(n, bracket);
    const lt = b.lastIndexOf("<");
    if (lt >= 0 && !b.slice(lt).includes(">") && b.length - lt < FOLLOW_OPEN.length + 2) n = Math.min(n, lt);
    return n;
  }

  private emit(s: string): string {
    if (!s) return "";
    if (s.includes("<counter>")) this.hasCounter = true;
    const r = rewriteCitations(s, this.known);
    this.miss.push(...r.miss);
    this.cited.push(...r.cited);
    return r.text;
  }

  private parseFollowups() {
    const raw = this.followRaw.trim();
    this.followRaw = "";
    if (!raw) return;
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      const arr = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw) as unknown;
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        if (!it || typeof it !== "object") continue;
        const o = it as Record<string, unknown>;
        const label = String(o.label ?? "").trim().slice(0, MAX_LABEL);
        const prompt = String(o.prompt ?? "").trim();
        const skill = String(o.skill ?? "").trim();
        if (!label || !prompt) continue;
        this.followups.push({ label, prompt, skill, ...(o.params && typeof o.params === "object" ? { params: o.params as Record<string, unknown> } : {}) });
      }
    } catch {
      /* malformed block: no follow-ups this turn */
    }
  }
}

/** Keep only follow-ups the workspace can actually run, at most three. */
export function usableFollowups(items: Followup[], available: Set<string>): Followup[] {
  return items.filter((f) => f.skill === "query_metrics" || available.has(f.skill)).slice(0, 3);
}

/** Split answer text into prose and counter segments for rendering. */
export function splitCounters(text: string): { kind: "text" | "counter"; text: string }[] {
  const out: { kind: "text" | "counter"; text: string }[] = [];
  const re = /<counter>([\s\S]*?)<\/counter>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push({ kind: "counter", text: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out.filter((s) => s.text.trim());
}
