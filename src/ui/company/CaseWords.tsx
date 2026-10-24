"use client";
/**
 * Our Chorus → Case words (DECISIONS, 7 Oct 2026): the sister brands named beside the subject and
 * the words a boycott uses, with what each matches in the data. Anyone sees what a word would match
 * before it is saved; a Builder adds and removes the team's own (Fair's stay); a Member's waits
 * for a Builder to approve it. Free: words are counted in the database.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { CaseWords as Words } from "@/company/caseWords";
import { Tag } from "../dashboard/parts";
import { Button } from "../kit/Button";
import { TextField } from "../kit/Form";
import { IconClose } from "../kit/icons";
import { ErrorBox, Panel } from "../kit/Section";
import { Skel } from "../kit/Skeleton";

const n = (x: number) => x.toLocaleString("en-US");
const U = "/api/builder/case-words";
const ROWS = "m-0 flex list-none flex-col divide-y divide-card-border p-0";
const ROW = "flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4";

async function post(body: unknown) {
  const r = await fetch(U, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true as const, ...j } : { ok: false as const, error: (j.error as string) ?? `HTTP ${r.status}` };
}

/** what a word matches so far, with the button that adds it */
function Check({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700">
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

export function CaseWords({ builder }: { builder: boolean }) {
  const [w, setW] = useState<Words | null>(null);
  const [name, setName] = useState("");
  const [terms, setTerms] = useState("");
  const [word, setWord] = useState("");
  const [check, setCheck] = useState<{ list: string; posts: number; comments: number; terms: string[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch(U).then((r) => (r.ok ? r.json() : null)).then((j) => j && setW(j)); }, []);
  async function preview(list: "partners" | "boycott") {
    setMsg(""); setBusy(true);
    const r = await post({ list, action: "preview", name: list === "partners" ? name : word, terms: list === "partners" ? terms : word });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setCheck({ list, ...(r.preview as { posts: number; comments: number; terms: string[] }) });
  }
  async function change(list: "partners" | "boycott", action: "add" | "remove" | "request" | "approve" | "decline", o: { name?: string; terms?: string; id?: string }) {
    setMsg(""); setBusy(true);
    const r = await post({ list, action, ...o });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setW(r.words as Words); setCheck(null); setName(""); setTerms(""); setWord("");
  }
  if (!w) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Reading the case words…</span>
        <Skel className="h-4 w-48" /><Skel className="h-3.5 w-full" /><Skel className="h-3.5 w-2/3" />
      </div>
    );
  }
  // a Member's word waits for a Builder; the Builder sees what it would match and answers
  const add = (list: "partners" | "boycott", o: { name?: string; terms?: string }) => change(list, builder ? "add" : "request", o);
  const counts = (posts: number, comments: number) => <small className="whitespace-nowrap text-xs tabular-nums text-gray-500">{n(posts)} posts · {n(comments)} comments</small>;
  return (
    <div className="flex flex-col gap-4">
      {w.pending.length > 0 && (
        <Panel title={<>{builder ? "Waiting for you" : "Waiting for a Builder"} <span className="font-normal text-gray-500">· asked by Members; nothing counts until a Builder adds it</span></>} className="border-brand-palette-200 bg-brand-palette-50">
          <ul className={ROWS}>
            {w.pending.map((r) => (
              <li key={r.id} className={ROW}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2"><b className="text-sm font-semibold text-gray-900">{r.name}</b><Tag>{r.list === "partners" ? "sister brand" : "boycott word"}</Tag><span className="text-xs text-gray-500">asked by {r.by}</span></span>
                  {r.list === "partners" && <p className="text-sm text-gray-600">{r.terms.join(", ")}</p>}
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {counts(r.posts, r.comments)}
                  {builder && <Button size="sm" disabled={busy} onClick={() => change(r.list, "approve", { id: r.id })}>Add</Button>}
                  {builder && <Button variant="ghost" size="sm" disabled={busy} onClick={() => change(r.list, "decline", { id: r.id })}>Decline</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={<>Sister brands <span className="font-normal text-gray-500">· named beside you in posts and comments; the Sister brands slide and the chronology count them</span></>}>
        {w.partners.length ? (
          <ul className={ROWS}>
            {w.partners.map((p) => (
              <li key={p.name} className={ROW}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2"><b className="text-sm font-semibold text-gray-900">{p.name}</b><span className="text-xs text-gray-500">{p.by ? `added by ${p.by}` : "Fair set"}</span></span>
                  <p className="text-sm text-gray-600">{p.terms.join(", ")}</p>
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {counts(p.posts, p.comments)}
                  {builder && p.by && <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={busy} onClick={() => change("partners", "remove", { name: p.name })}>Remove</Button>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">None yet. Add one below and see what it matches first.</p>}
        <div className="grid gap-2 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
          <TextField aria-label="Sister brand" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand, e.g. Instaperfect" maxLength={40} />
          <TextField aria-label="Words people use for it" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Words people use for it, comma between (optional)" maxLength={200} />
          <Button variant="outline" size="sm" disabled={busy || !name.trim()} onClick={() => preview("partners")}>See what it matches</Button>
        </div>
        {check?.list === "partners" && (
          <Check action={<Button size="sm" disabled={busy} onClick={() => add("partners", { name, terms })}>{builder ? "Add" : "Send to my Builder"}</Button>}>
            {check.terms.join(", ")}: <b className="font-semibold text-gray-900">{n(check.posts)}</b> posts and <b className="font-semibold text-gray-900">{n(check.comments)}</b> comments in the data so far
          </Check>
        )}
      </Panel>

      <Panel title={<>Boycott words <span className="font-normal text-gray-500">· a post or comment using one counts as a boycott call</span></>}>
        {w.boycott.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {w.boycott.map((b) => (
              <li key={b.term} title={`${n(b.posts)} posts · ${n(b.comments)} comments${b.by ? ` · added by ${b.by}` : " · Fair set"}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-1 pl-3 pr-1.5 text-xs font-semibold text-gray-700">
                {b.term}<span className="font-normal tabular-nums text-gray-500">{n(b.posts + b.comments)}</span>
                {builder && b.by ? (
                  <button type="button" aria-label={`Remove ${b.term}`} disabled={busy} onClick={() => change("boycott", "remove", { terms: b.term })}
                    className="inline-flex size-6 cursor-pointer max-md:size-11 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-brand-palette-600 disabled:cursor-not-allowed">
                    <IconClose size={12} />
                  </button>
                ) : <span className="w-1.5" />}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">None yet.</p>}
        <div className="grid gap-2 md:grid-cols-[minmax(0,20rem)_auto] md:justify-start">
          <TextField aria-label="Boycott word" value={word} onChange={(e) => setWord(e.target.value)} placeholder="A word, e.g. tak beli" maxLength={40} />
          <Button variant="outline" size="sm" disabled={busy || word.trim().length < 2} onClick={() => preview("boycott")}>See what it matches</Button>
        </div>
        {check?.list === "boycott" && (
          <Check action={<Button size="sm" disabled={busy} onClick={() => add("boycott", { terms: word })}>{builder ? "Add" : "Send to my Builder"}</Button>}>
            <b className="font-semibold text-gray-900">{n(check.posts)}</b> posts and <b className="font-semibold text-gray-900">{n(check.comments)}</b> comments
          </Check>
        )}
      </Panel>
      {msg && <ErrorBox>{msg}</ErrorBox>}
    </div>
  );
}
