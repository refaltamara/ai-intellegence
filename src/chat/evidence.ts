/**
 * Evidence citation handling (PRD §5.4). The model cites [ev_03]; the server
 * rewrites known ids to <ev id="ev_03"></ev> before streaming and strips unknown
 * ones, counting them as evidence_miss (the hallucination metric).
 */
import type { Evidence } from "../skills/types";

const CITE = /\[((?:ev_\d{2,4})(?:\s*,\s*ev_\d{2,4})*)\]/g;

export function rewriteCitations(text: string, known: Set<string>): { text: string; miss: string[]; cited: string[] } {
  const miss: string[] = [];
  const cited: string[] = [];
  const out = text.replace(CITE, (_m, ids: string) => {
    const parts = ids.split(/\s*,\s*/);
    const kept = parts.filter((id) => {
      if (known.has(id)) {
        cited.push(id);
        return true;
      }
      miss.push(id);
      return false;
    });
    return kept.map((id) => `<ev id="${id}"></ev>`).join("");
  });
  return { text: out, miss, cited };
}

/** Streaming rewriter: holds back a trailing partial "[ev_" so a citation is never split. */
export class CitationStream {
  private buf = "";
  public miss: string[] = [];
  public cited: string[] = [];
  constructor(private known: Set<string>) {}

  push(delta: string): string {
    this.buf += delta;
    const open = this.buf.lastIndexOf("[");
    let flushUpTo = this.buf.length;
    if (open >= 0 && !this.buf.slice(open).includes("]") && this.buf.length - open < 48) flushUpTo = open;
    const ready = this.buf.slice(0, flushUpTo);
    this.buf = this.buf.slice(flushUpTo);
    return this.rewrite(ready);
  }

  flush(): string {
    const rest = this.buf;
    this.buf = "";
    return this.rewrite(rest);
  }

  private rewrite(s: string): string {
    if (!s) return "";
    const r = rewriteCitations(s, this.known);
    this.miss.push(...r.miss);
    this.cited.push(...r.cited);
    return r.text;
  }
}

/** Renumber a tool result's evidence ids into the turn-wide sequence so several tool calls never collide. */
export function renumberEvidence(evidence: Evidence[], rows: Record<string, unknown>[], summary: Record<string, unknown>, counter: { n: number }): { evidence: Evidence[]; rows: Record<string, unknown>[]; summary: Record<string, unknown>; map: Map<string, string> } {
  const map = new Map<string, string>();
  const out = evidence.map((e) => {
    counter.n += 1;
    const id = `ev_${String(counter.n).padStart(2, "0")}`;
    map.set(e.id, id);
    return { ...e, id };
  });
  const remap = (v: unknown): unknown => {
    if (typeof v === "string" && map.has(v)) return map.get(v);
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, remap(x)]));
    return v;
  };
  return { evidence: out, rows: rows.map((r) => remap(r) as Record<string, unknown>), summary: remap(summary) as Record<string, unknown>, map };
}
