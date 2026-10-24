"use client";
/**
 * Comments on a slide (DECISIONS, 7 Oct 2026): the team's notes on this version's slide, and CeMO's
 * replies when a comment mentions @CeMO, with the change it proposes as a card. Plain comments are
 * free; CeMO's reply costs what a question costs, a drafted change what a drafted change costs.
 */
import { useState } from "react";
import type { SlideComment } from "@/decks/comments";
import { cn } from "../cn";
import { Button } from "../kit/Button";
import { Spinner } from "../kit/Spinner";
import { DeckChangeCard } from "./DeckChangeCard";
import { COMPOSER, COMPOSER_INPUT } from "./formParts";

const when = (t: string) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SlideComments({ deckId, reportId, n, slideTitle, comments, onPosted }: { deckId: string; reportId: string; n: number; slideTitle: string; comments: SlideComment[]; onPosted: (c: SlideComment[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const here = comments.filter((c) => c.slide === n);
  const cemo = /(^|\s)@cemo\b/i.test(text);
  async function post() {
    setBusy(true); setErr("");
    const r = await fetch(`/api/decks/${deckId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report_id: reportId, slide: n, text }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Could not post."); return; }
    setText("");
    onPosted(j.comments as SlideComment[]);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <small className="block shrink-0 truncate px-4 pt-3 text-xs text-gray-500" title={`Slide ${n} · ${slideTitle}`}>Slide {n} · {slideTitle}</small>
      <div className="flex min-h-45 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
        {!here.length && <p className="rounded-2xl border border-card-border bg-gray-50 px-3.5 py-3 text-xs leading-relaxed text-gray-600">No comments on this slide yet. Leave a note for the team, or mention @CeMO to change the slide, the deck or its template.</p>}
        {here.map((c) => (
          <div key={c.id} className={cn("flex flex-col gap-1.5", c.author === "cemo" && "rounded-2xl bg-brand-palette-50 px-3.5 py-3")}>
            <b className={cn("flex flex-wrap items-baseline gap-x-2 text-xs font-semibold", c.author === "cemo" ? "text-brand-palette-800" : "text-gray-900")}>
              {c.author === "cemo" ? "CeMO" : c.author_name ?? c.author_email ?? "Someone"}
              <span className="font-regular text-gray-500">{when(c.created_at)}</span>
            </b>
            <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-gray-800">{c.text}</p>
            {c.proposal && <DeckChangeCard p={c.proposal} from="comment" />}
          </div>
        ))}
        {busy && cemo && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-brand-palette-50 px-3.5 py-3" aria-live="polite">
            <b className="text-xs font-semibold text-brand-palette-800">CeMO</b>
            <span className="flex items-center gap-2 text-sm text-gray-600"><Spinner />Reading the slide…</span>
          </div>
        )}
      </div>
      {err && <p role="alert" className="mx-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
      <div className="shrink-0 p-3">
        <div className={COMPOSER}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Comment, or @CeMO to change…" aria-label={`Comment on slide ${n}`} className={COMPOSER_INPUT}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) void post(); }} />
          <div className="flex items-center justify-between gap-2">
            <small className="px-1 text-xs text-gray-500">{cemo ? "CeMO will reply: 1 credit, 3 if it drafts a change" : "Comments are free"}</small>
            <Button size="sm" className="min-w-20" disabled={busy || !text.trim()} isLoading={busy} loadingLabel={cemo ? "CeMO is reading…" : "Posting…"} onClick={post}>Post</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
