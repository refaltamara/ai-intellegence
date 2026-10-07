"use client";
/**
 * A change to a deck, as CeMO proposed it (in Chats or under a slide comment): what is added (+),
 * dropped (−) and kept (=). A Builder applies it to the deck alone or to the deck and its template;
 * a Member applies it to the deck and sends the template change to their Builder. The server
 * checks who may do what (src/decks/changes.ts); the card shows what came back.
 */
import Link from "next/link";
import { useState } from "react";
import type { DeckChangeProposal } from "@/decks/changes";

type Done = { template: boolean; note: string };

export function DeckChangeCard({ p, from = "chat", onApplied }: { p: DeckChangeProposal; from?: "chat" | "comment"; onApplied?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [msg, setMsg] = useState("");
  async function apply(template: boolean) {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/decks/${p.deck_id}/change`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ change: p.change, template, from }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "That did not work."); return; }
    const t = j.template as { error?: string; how?: string; title?: string } | null;
    const note = !t ? "Applied to the deck; the next version carries it." : t.error ? `Applied to the deck. The template did not change: ${t.error}` : t.how === "waiting" ? `Applied to the deck. The template change waits for your Builder.` : t.how === "new" ? `Applied to the deck, and saved as your team's template "${t.title}".` : `Applied to the deck and to the template "${t.title}".`;
    setDone({ template, note });
    onApplied?.();
  }
  const tplLabel = p.team_template ? "the template" : "a team template";
  return (
    <div className="card proposal">
      <h4><span><i className="badge client">Deck</i>Change to {p.deck_name}</span><span className={`pstatus ${done ? "approved" : "draft"}`}>{done ? "Applied" : "Not applied yet"}</span></h4>
      <div className="body">
        <ul className="dchanges">
          {p.lines.map((l, i) => <li key={i} className={l.sign === "+" ? "add" : l.sign === "−" ? "drop" : l.sign === "=" ? "keep" : "set"}><b>{l.sign}</b><span>{l.text}{l.note && <small> {l.note}</small>}</span></li>)}
        </ul>
        {p.dropped.length > 0 && <ul className="dropped">{p.dropped.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        {done && <p className="muted">{done.note}</p>}
      </div>
      <footer>
        {msg && <span className="err">{msg}</span>}
        {!done && p.builder && <button className="btn pri sm" disabled={busy} onClick={() => apply(true)}>This deck + {tplLabel}</button>}
        {!done && p.builder && <button className="btn sm" disabled={busy} onClick={() => apply(false)}>This deck only</button>}
        {!done && !p.builder && <button className="btn pri sm" disabled={busy} onClick={() => apply(false)}>Apply to this deck</button>}
        {!done && !p.builder && <button className="btn sm" disabled={busy} onClick={() => apply(true)}>Deck + send template to my Builder</button>}
        {done && <Link className="btn sm ghost" href={`/decks/${p.deck_id}`}>Open the deck</Link>}
      </footer>
    </div>
  );
}
