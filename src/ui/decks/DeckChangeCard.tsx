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
import { cn } from "../cn";
import { Button, buttonClass } from "../kit/Button";
import { ProposalShell } from "../kit/ProposalShell";

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
    <ProposalShell kind="Deck" title={`Change to ${p.deck_name}`} status={done ? "Applied" : "Not applied yet"} tone={done ? "approved" : "draft"} error={msg}
      actions={<>
        {!done && p.builder && <Button variant="outline" size="sm" disabled={busy} onClick={() => apply(false)}>This deck only</Button>}
        {!done && p.builder && <Button size="sm" disabled={busy} onClick={() => apply(true)}>This deck + {tplLabel}</Button>}
        {!done && !p.builder && <Button variant="outline" size="sm" disabled={busy} onClick={() => apply(true)}>Deck + send template to my Builder</Button>}
        {!done && !p.builder && <Button size="sm" disabled={busy} onClick={() => apply(false)}>Apply to this deck</Button>}
        {done && <Link className={buttonClass("outline", "sm")} href={`/decks/${p.deck_id}`}>Open the deck</Link>}
      </>}>
      <ul className="flex flex-col gap-1">
        {p.lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <b aria-hidden="true" className={cn("w-4 shrink-0 text-center font-bold", l.sign === "+" ? "text-green-700" : l.sign === "−" ? "text-red-700" : "text-gray-400")}>{l.sign}</b>
            <span className={cn(l.sign === "−" && "text-gray-500 line-through decoration-gray-300")}>
              {l.text}{l.note && <small className="text-xs text-gray-500"> {l.note}</small>}
            </span>
          </li>
        ))}
      </ul>
      {p.dropped.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-amber-800">{p.dropped.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      {done && <p className="text-xs text-gray-500">{done.note}</p>}
    </ProposalShell>
  );
}
