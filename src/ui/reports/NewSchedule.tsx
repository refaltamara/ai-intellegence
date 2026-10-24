"use client";
/** A new schedule: the Weekly Competitor Pulse, or any analysis described in plain words. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentDraft } from "@/agents/promote";
import type { ClientContract as WeeklyContract } from "@/competitor/contract";
import { CARD, COMPOSER, COMPOSER_INPUT, SectionTitle } from "../decks/formParts";
import { fmtDate } from "../format";
import { Button } from "../kit/Button";
import { Chip, Field, TextField } from "../kit/Form";
import { PageHeader } from "../kit/PageHeader";
import { Segmented } from "../kit/Segmented";
import { SelectInput } from "../kit/SelectInput";
import { Switch } from "../kit/Switch";
import { LINK } from "./docParts";
import { WeeklyForm } from "./WeeklyForm";

export type SetupOptions = { skills: { name: string; title: string }[]; modelConfigured: boolean; emailConfigured: boolean; brands: { id: string; name: string }[]; template: WeeklyContract | null; weeks: { key: string; label: string }[] };
type Draft = Omit<AgentDraft, "from_skill_run_id" | "notes"> & { from_skill_run_id?: string; notes?: string[] };

const CHANNELS = ["email", "whatsapp", "in_app"];

export function NewSchedule({ setup, say }: { setup: SetupOptions; say: (m: string) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"weekly" | "analysis">("weekly");
  const [text, setText] = useState("Every Monday, compare Skintific, Somethinc and Emina on TikTok and email me. Only if something changed.");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [paramsText, setParamsText] = useState("{}");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  function done(m: string) {
    say(m);
    router.push("/reports");
    router.refresh();
  }
  async function parse() {
    setBusy("draft"); setError("");
    const r = await fetch("/api/agents/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json();
    setBusy(null);
    if (j.error) { setError(j.error); return; }
    setDraft(j.draft); setParamsText(JSON.stringify(j.draft.params, null, 1));
  }
  async function create() {
    if (!draft) return;
    let params: Record<string, unknown>;
    try { params = JSON.parse(paramsText); } catch { setError("Params must be valid JSON"); return; }
    setBusy("create"); setError("");
    const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, params }) });
    const j = await r.json();
    setBusy(null);
    if (j.error) { setError(j.error); return; }
    done(`Scheduled, next run ${fmtDate(j.agent.next_run_at)}`);
  }
  const toggle = (c: string) => {
    if (!draft) return;
    const has = draft.delivery.channels.includes(c);
    setDraft({ ...draft, delivery: { ...draft.delivery, channels: has ? draft.delivery.channels.filter((x) => x !== c) : [...draft.delivery.channels, c] } });
  };

  return (
    <>
      <PageHeader
        title="New schedule"
        subtitle={<><Link className={LINK} href="/reports">Reports</Link> · the Weekly Competitor Pulse, or any analysis on a schedule</>}
      />
      <Segmented tabs label="What to schedule" value={mode} onChange={setMode} className="self-start"
        options={[{ key: "weekly" as const, label: "Weekly Competitor Pulse" }, { key: "analysis" as const, label: "Any analysis" }]} />
      {mode === "weekly" ? (
        <>
          <p className="max-w-3xl text-sm leading-relaxed text-gray-700">A deck on what competitors did last week and what to do about it, as PowerPoint and PDF, in this list and in your inbox.</p>
          {!setup.emailConfigured && <p className="text-xs text-gray-500">Email delivery needs RESEND_API_KEY and EMAIL_FROM; until then reports land in this list only.</p>}
          <WeeklyForm key="new" brands={setup.brands} initial={{ contract: setup.template }} onDone={done} />
        </>
      ) : (
        <>
          <section className={CARD}>
            <SectionTitle title="Schedule an analysis" hint="Describe it the way you'd brief a colleague. We turn it into a schedule you can edit." />
            <div className={COMPOSER}>
              <textarea aria-label="Describe the schedule" rows={3} className={COMPOSER_INPUT} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex justify-end">
                <Button size="sm" disabled={!setup.modelConfigured} isLoading={busy === "draft"} loadingLabel="Reading…" onClick={parse} title={setup.modelConfigured ? undefined : "ANTHROPIC_API_KEY is not set"}>Set it up</Button>
              </div>
            </div>
            {!setup.modelConfigured && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">The model is not configured here, so free-text setup is off. Use &quot;Watch this weekly&quot; under an answer in Chats.</p>}
            {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </section>
          {draft && (
            <section className={CARD}>
              <SectionTitle title="Here's how we read that. Edit anything." hint={`${draft.schedule.human} · ${draft.schedule.tz}`} />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Name"><TextField value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field group label="Analysis">
                  <SelectInput withSearch size="sm" ariaLabel="Analysis" value={draft.skill} onChange={(v) => setDraft({ ...draft, skill: v })} searchPlaceholder="Search analyses"
                    options={setup.skills.map((s) => ({ value: s.name, label: s.title }))} />
                </Field>
                <Field label="Cron" hint={draft.schedule.human}><TextField className="font-mono" value={draft.schedule.cron} onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, cron: e.target.value } })} /></Field>
                <Field label="Params" wide>
                  <textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)} rows={4}
                    className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 outline-none transition-all duration-200 focus:border-brand-palette-600 focus:ring-2 focus:ring-brand-palette-500/15" />
                </Field>
                <Field group label="Deliver to">
                  <div className="flex flex-wrap gap-2">
                    {CHANNELS.map((c) => <Chip key={c} on={draft.delivery.channels.includes(c)} disabled={c === "in_app"} title={c === "in_app" ? "Always in this list" : undefined} onClick={() => toggle(c)} className="disabled:cursor-default">{c}</Chip>)}
                  </div>
                </Field>
                {draft.delivery.channels.includes("email") && <Field label="Email"><TextField placeholder="name@company.com" value={draft.delivery.email ?? ""} onChange={(e) => setDraft({ ...draft, delivery: { ...draft.delivery, email: e.target.value } })} /></Field>}
                <Switch on={draft.only_if_changed} onChange={(v) => setDraft({ ...draft, only_if_changed: v })} label="Only if changed" />
              </div>
              {!!draft.notes?.length && <p className="text-xs text-gray-500">{draft.notes.join(". ")}.</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Discard</Button>
                <Button size="sm" isLoading={busy === "create"} loadingLabel="Creating…" onClick={create}>Schedule it</Button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
