"use client";
/**
 * Make or edit a deck (DECISIONS, 2 Oct 2026): a template, the brands to watch (or focus on), an optional
 * client, week or month, the platforms, the slides from the library, the period of the first version, and
 * whether it makes the next version on its own. Creating builds the first version before it opens.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DeckOptions } from "@/decks/page";
import type { DeckSpec } from "@/decks/spec";
import { MultiSelect } from "../MultiSelect";
import { cn } from "../cn";
import { Button } from "../kit/Button";
import { Chip, Field, TextField } from "../kit/Form";
import { SelectInput } from "../kit/SelectInput";
import { IconCheck } from "../kit/icons";
import { Segmented } from "../kit/Segmented";
import { Spinner } from "../kit/Spinner";
import { Switch } from "../kit/Switch";
import { PeriodPick } from "./PeriodPick";
import { SlideDescriber, type AddedSlide } from "./SlideDescriber";
import { DeckDescriber } from "./DeckDescriber";
import { CARD, CheckCard, MadeBy, SectionTitle } from "./formParts";
import type { DeckDraft } from "@/decks/describe";

type Group = DeckSpec["watchlist"][number];
type Initial = { id: string; name: string; spec: DeckSpec; recurring: boolean; template: string | null; ends_on?: string | null };

const PLATFORM_NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };

/** What "Add to a deck → New deck" on the Dashboard carries: the section's slide, its brands and its grain. */
export type Prefill = { slide: string; brands: string[]; grain: "week" | "month" | null };

export function DeckForm({ options, initial, prefill }: { options: DeckOptions; initial?: Initial; prefill?: Prefill | null }) {
  const router = useRouter();
  const edit = !!initial;
  const [template, setTemplate] = useState(initial?.template ?? (prefill ? "blank" : options.templates[0].key));
  const t = options.templates.find((x) => x.key === template) ?? options.templates[0];
  const [name, setName] = useState(initial?.name ?? "");
  const brandNames = new Map(options.brands.map((b) => [b.id, b.name]));
  const [watch, setWatch] = useState<Group[]>(initial?.spec.watchlist ?? (prefill?.brands ?? []).filter((id) => brandNames.has(id)).map((id) => ({ name: brandNames.get(id)!, group: "core" as const, brand_ids: [id] })));
  const [clientOn, setClientOn] = useState(!!initial?.spec.client);
  const [clientName, setClientName] = useState(initial?.spec.client?.name ?? options.client?.name ?? "");
  const [clientIds, setClientIds] = useState<string[]>(initial?.spec.client?.brands.flatMap((b) => b.brand_ids) ?? options.client?.brand_ids ?? []);
  const [grain, setGrain] = useState<"day" | "week" | "month">(initial?.spec.grain ?? prefill?.grain ?? t.grain);
  const [platforms, setPlatforms] = useState<string[]>(initial?.spec.platforms?.length ? initial.spec.platforms : options.platforms);
  const [slides, setSlides] = useState<string[]>(initial?.spec.slides ?? (prefill ? [...new Set(["summary", prefill.slide, "moves", "evidence"])] : t.slides));
  const [period, setPeriod] = useState(initial?.spec.grain === "day" ? (options.periods.day[0]?.key ?? "") : "");
  const [recurring, setRecurring] = useState(initial?.recurring ?? t.recurring);
  // until when it repeats (16 Oct 2026); empty = until stopped
  const [until, setUntil] = useState(initial?.ends_on ?? "");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  // the team's analyses (Fair's recipes and the team's own skills) can ride in a deck as findings, run again over each version's period
  const [picked, setPicked] = useState<string[]>((initial?.spec.findings ?? []).filter((f) => f.skill.startsWith("recipe:")).map((f) => f.skill.slice(7)));
  // slides the person described here (kept as the team's skills) join the list straight away
  const [added, setAdded] = useState<AddedSlide[]>([]);
  const teamSkills = [...options.team_skills, ...added.filter((a) => !options.team_skills.some((x) => x.key === a.key))];
  const [alsoTemplate, setAlsoTemplate] = useState(false);
  // titles of slides a template or the deck already carries, for those not in the list (another person's drafts)
  const knownTitles = new Map([...(edit ? [] : t.findings ?? []), ...(initial?.spec.findings ?? [])].map((f) => [f.skill.replace(/^recipe:/, ""), f]));
  const chatFindings = (initial?.spec.findings ?? []).filter((f) => !f.skill.startsWith("recipe:"));
  const hasFindings = chatFindings.length > 0 || picked.length > 0;
  // a PR deck (one brand's reputation, src/reputation/) or a Social Media deck (one brand's own accounts, src/social/): a focus brand and the family's own slides
  const family = edit ? (initial?.spec.rep ? "reputation" : initial?.spec.social ? "social" : null) : t.family ?? null;
  const isRep = family != null;
  const fam = initial?.spec.rep ?? initial?.spec.social;
  const library = family === "social" ? options.social_slides : options.rep_slides;
  const [focus, setFocus] = useState(fam?.focus ?? options.focus ?? options.brands[0]?.id ?? "");
  const [repPlatform, setRepPlatform] = useState(fam?.platform ?? "all");
  const [repSlides, setRepSlides] = useState<string[]>(fam?.slides ?? t.rep_slides ?? t.social_slides ?? ["summary"]);

  // a template sets the grain, the slides and whether it recurs; the brands stay as picked
  const pickTemplate = (key: string) => {
    const x = options.templates.find((y) => y.key === key)!;
    setTemplate(key);
    setGrain(x.grain);
    setPeriod(x.grain === "day" ? options.periods.day[0]?.key ?? "" : "");
    setSlides(x.slides);
    setRecurring(x.recurring);
    if (x.rep_slides ?? x.social_slides) setRepSlides((x.rep_slides ?? x.social_slides)!);
    // a team template carries its own slides (the team's analyses)
    setPicked((x.findings ?? []).filter((f) => f.skill.startsWith("recipe:")).map((f) => f.skill.slice(7)));
  };
  // "Describe the deck you want": CeMO's layout fills the form (src/decks/describe.ts); the person checks it before creating
  const applyDraft = (d: DeckDraft) => {
    const x = options.templates.find((y) => y.key === d.template);
    if (!x) return;
    pickTemplate(x.key);
    setName(d.name);
    setGrain(d.grain);
    setPeriod(d.grain === "day" ? options.periods.day[0]?.key ?? "" : "");
    if (x.family) {
      if (d.focus) setFocus(d.focus);
      setRepPlatform(d.platform);
      setRepSlides(d.slides);
    } else {
      if (d.brands.length) setWatch(d.brands.map((id) => ({ name: brandName.get(id) ?? id, group: "core" as const, brand_ids: [id] })));
      if (d.platforms.length) setPlatforms(d.platforms);
      setSlides(d.slides);
    }
    if (d.added.length) setAdded((a) => [...a, ...d.added.filter((n) => !a.some((y) => y.key === n.key))]);
    setPicked([...new Set([...(x.findings ?? []).filter((f) => f.skill.startsWith("recipe:")).map((f) => f.skill.slice(7)), ...d.skills])]);
  };
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const i = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(i);
  }, [busy]);

  const brandName = useMemo(() => new Map(options.brands.map((b) => [b.id, b.name])), [options.brands]);
  const taken = new Set([...watch.flatMap((w) => w.brand_ids), ...(clientOn ? clientIds : [])]);
  const addBrands = (ids: string[]) => setWatch((w) => [...w, ...ids.filter((id) => !taken.has(id)).map((id) => ({ name: brandName.get(id) ?? id, group: "core" as const, brand_ids: [id] }))]);
  const toggleSlide = (k: string) => setSlides((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const periods = options.periods[grain];
  // a template's name follows the comparison picked: "Weekly Reputation Report" becomes "Daily Reputation Report" day by day
  const byGrain = (x: string) => (grain === "day" ? x.replace(/^(Weekly|Monthly)\b/, "Daily") : grain === "week" ? x.replace(/^Monthly\b/, "Weekly") : x.replace(/^Weekly\b/, "Monthly"));
  const tTitle = byGrain(t.title), tName = byGrain(t.name);

  const teamFindings = () => picked.map((k) => {
    const x = teamSkills.find((y) => y.key === k);
    const was = knownTitles.get(k);
    return { key: was?.key ?? `r_${k}`.slice(0, 20), skill: `recipe:${k}`, params: {}, question: x?.description ?? was?.question ?? k, title: x?.title ?? was?.title ?? k, ...(was?.after ? { after: was.after } : {}), ...(x?.by ? { by: x.by } : was?.by ? { by: was.by } : {}) };
  });
  function spec(): DeckSpec {
    const own = [...chatFindings, ...teamFindings()];
    if (family === "social") return { title: name.trim() || t.title, grain, platforms: [], client: null, watchlist: [], slides: ["summary"], social: { focus, platform: repPlatform, slides: repSlides as NonNullable<DeckSpec["social"]>["slides"] }, ...(own.length ? { findings: own } : {}) };
    if (family === "reputation") return { title: name.trim() || tTitle, grain, platforms: [], client: null, watchlist: [], slides: ["summary"], rep: { focus, platform: repPlatform, slides: repSlides as NonNullable<DeckSpec["rep"]>["slides"] }, ...(own.length ? { findings: own } : {}) };
    return {
      title: name.trim() || t.title,
      grain,
      platforms: platforms as DeckSpec["platforms"],
      client: clientOn && clientName.trim() && clientIds.length ? { name: clientName.trim(), brands: clientIds.map((id) => ({ name: brandName.get(id) ?? id, brand_ids: [id] })) } : null,
      watchlist: watch,
      slides: (picked.length && !slides.includes("findings") ? [...slides, "findings"] : slides) as DeckSpec["slides"],
      ...(hasFindings ? { findings: [...chatFindings, ...teamFindings()] } : {}),
    };
  }

  async function submit(andBuild: boolean) {
    setError("");
    if (isRep && !focus) { setError("Pick the brand this deck is about."); return; }
    if (!isRep && !watch.length) { setError(t.brands === "focus" ? "Pick the brand (or brands) this deck is about." : "Pick at least one brand to watch."); return; }
    if (!isRep && !platforms.length) { setError("Pick at least one platform."); return; }
    setBusy(true);
    setElapsed(0);
    try {
      if (!edit) {
        const r = await fetch("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || (family === "reputation" ? tName : t.name), template, spec: spec(), recurring, ends_on: recurring && until ? until : null, period: period || undefined }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.deck) throw new Error(j.error ?? "Could not make the deck");
        router.push(`/decks/${j.deck.id}${j.version?.report_id ? `?v=${j.version.report_id}` : ""}`);
        return;
      }
      const r = await fetch(`/api/decks/${initial!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || initial!.name, spec: spec(), recurring, ...(recurring ? { ends_on: until || null } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save");
      if (alsoTemplate) {
        // the template this deck came from takes the deck as it is now (a Member's change waits for a Builder)
        const tr = await fetch(`/api/decks/${initial!.id}/change`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ change: {}, template: true, from: "form" }) });
        const tj = await tr.json().catch(() => ({}));
        if (!tr.ok || tj.template?.error) throw new Error(`Saved the deck; the template did not change: ${tj.error ?? tj.template?.error}`);
      }
      if (andBuild) {
        const v = await fetch(`/api/decks/${initial!.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: period || undefined }) });
        const o = await v.json().catch(() => ({}));
        if (!v.ok || !o.report_id) throw new Error(o.message ?? "Saved, but the new version could not be made");
        router.push(`/decks/${initial!.id}?v=${o.report_id}`);
      } else router.push(`/decks/${initial!.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const grainOptions = [
    ...(family === "reputation" ? [{ key: "day" as const, label: "Day on day" }] : []),
    { key: "week" as const, label: "Week on week" },
    { key: "month" as const, label: "Month on month" },
  ];
  const pickGrain = (g: "day" | "week" | "month") => { setGrain(g); setPeriod(g === "day" ? options.periods.day[0]?.key ?? "" : ""); };

  return (
    <div className="flex w-full flex-col gap-6">
      {!edit && <DeckDescriber onDraft={applyDraft} />}
      {!edit && (
        <section className={CARD}>
          <SectionTitle title="Or start from" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {options.templates.map((x) => {
              const on = template === x.key;
              return (
                <button key={x.key} type="button" aria-pressed={on} onClick={() => pickTemplate(x.key)}
                  className={cn("flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-4 text-left font-sans transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600",
                    on ? "border-brand-palette-200 bg-brand-palette-50" : "border-card-border bg-white hover:border-brand-palette-300")}>
                  <span className="flex items-start justify-between gap-2">
                    <b className="text-sm font-semibold text-gray-900">{x.name}</b>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <MadeBy badge={x.badge} by={x.by} />
                      {on && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-palette-600 text-white"><IconCheck size={12} /></span>}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-gray-600">{x.description}</span>
                  <small className="mt-auto pt-1 text-xs text-gray-500">{x.grain === "month" ? "Month on month" : x.grain === "day" ? "Day on day" : "Week on week"} · {(x.rep_slides ?? x.social_slides ?? x.slides).length} slide types</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className={CARD}>
        <SectionTitle title="The deck" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Name"><TextField value={name} onChange={(e) => setName(e.target.value)} placeholder={initial?.name ?? (family === "reputation" ? tTitle : t.title)} maxLength={80} /></Field>
          <Field label="Compare" group>
            <Segmented label="Compare" value={grain} onChange={pickGrain} options={grainOptions} className="self-start" />
          </Field>
          <Field label="Platforms" group wide>
            {isRep ? (
              <Segmented label="Platforms" value={repPlatform} onChange={setRepPlatform} className="self-start"
                options={["all", ...options.platforms].map((p) => ({ key: p, label: p === "all" ? "All" : PLATFORM_NAME[p] ?? p }))} />
            ) : (
              <span className="flex flex-wrap gap-2">
                {options.platforms.map((p) => (
                  <Chip key={p} on={platforms.includes(p)} onClick={() => setPlatforms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}>{PLATFORM_NAME[p] ?? p}</Chip>
                ))}
              </span>
            )}
          </Field>
          {isRep && (
            <Field label="The brand this deck is about" group>
              <SelectInput withSearch size="sm" ariaLabel="The brand this deck is about" value={focus} onChange={setFocus} searchPlaceholder="Search brands"
                options={options.brands.map((b) => ({ value: b.id, label: `${b.name}${b.id === options.focus ? " (you)" : ""}` }))} />
            </Field>
          )}
        </div>
      </section>

      {isRep && (
        <section className={CARD}>
          <SectionTitle title="Slides" hint={`${repSlides.length} picked; every other brand is the benchmark`} />
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {library.map((s) => {
              const locked = s.kind === "summary";
              return (
                <CheckCard key={s.kind} checked={locked || repSlides.includes(s.kind)} disabled={locked} title={s.title} description={s.description}
                  onChange={() => setRepSlides((x) => (x.includes(s.kind) ? x.filter((y) => y !== s.kind) : [...x, s.kind]))} />
              );
            })}
          </div>
        </section>
      )}

      {!isRep && (
        <>
          <section className={CARD}>
            <SectionTitle title={t.brands === "focus" && !edit ? "The brands this deck is about" : "Brands to watch"} />
            {watch.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {watch.map((w, i) => {
                  const label = `${w.name}${w.brand_ids.length > 1 ? ` (${w.brand_ids.length} brands)` : ""}`;
                  return (
                    <li key={`${w.name}-${i}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-palette-50 py-0.5 pl-2.5 pr-0.5 text-xs font-semibold text-brand-palette-800">
                      {label}
                      <button type="button" aria-label={`Remove ${label}`} onClick={() => setWatch((x) => x.filter((_, j) => j !== i))}
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-brand-palette-100 focus-visible:outline-2 focus-visible:outline-brand-palette-600 max-md:h-9 max-md:w-9">×</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <MultiSelect options={options.brands.filter((b) => !taken.has(b.id))} value={[]} onChange={addBrands} placeholder={watch.length ? "Add another brand…" : "Search brands…"} />
            {options.starter && !edit && (
              <button type="button" className="self-start cursor-pointer rounded-lg px-1 text-sm font-semibold text-brand-palette-700 underline-offset-2 hover:text-brand-palette-800 hover:underline focus-visible:outline-2 focus-visible:outline-brand-palette-600 max-md:min-h-11"
                onClick={() => { setWatch(options.starter!.watchlist); if (options.starter!.client) { setClientOn(true); setClientName(options.starter!.client.name); setClientIds(options.starter!.client.brands.flatMap((b) => b.brand_ids)); } }}>
                Use the watchlist of {options.starter.label}
              </button>
            )}
            <div className="border-t border-card-border pt-3">
              <Switch on={clientOn} onChange={setClientOn} label="Prepared for a client" hint="The moves are written for them; their brands get an appendix." />
              {clientOn && (
                <div className="mt-3 grid gap-4 md:grid-cols-[1fr_2fr]">
                  <Field label="Client"><TextField value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Paragon" maxLength={60} /></Field>
                  <Field label="The client's brands" group><MultiSelect options={options.brands.filter((b) => !watch.some((w) => w.brand_ids.includes(b.id)))} value={clientIds} onChange={setClientIds} placeholder="Search brands…" /></Field>
                </div>
              )}
            </div>
          </section>

          <section className={CARD}>
            <SectionTitle title="Slides" hint={`${slides.length} picked; they print in this order`} />
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {options.slides.filter((s) => s.kind !== "findings" || hasFindings).map((s) => {
                const locked = !!s.required;
                const blocked = s.needs === "client" && !clientOn;
                const tag = [s.pages === "1" ? "" : s.pages, blocked ? "needs a client" : ""].filter(Boolean).join(" · ");
                return <CheckCard key={s.kind} checked={locked || (slides.includes(s.kind) && !blocked)} disabled={locked || blocked} onChange={() => toggleSlide(s.kind)} title={s.title} tag={tag || undefined} description={s.description} />;
              })}
            </div>
          </section>
        </>
      )}

      <section className={CARD}>
        <SectionTitle title="Your team's slides" hint={`Analyses counted again for every version's dates, a slide each${isRep ? ", after the slides above" : ""}.`} />
        {teamSkills.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {teamSkills.map((x) => (
              <CheckCard key={x.key} checked={picked.includes(x.key)} title={x.title} description={x.description} badge={<MadeBy badge={x.badge} by={x.by} />}
                onChange={() => setPicked((p) => (p.includes(x.key) ? p.filter((k) => k !== x.key) : [...p, x.key].slice(0, 6)))} />
            ))}
          </div>
        )}
        <SlideDescriber onAdd={(a) => { setAdded((x) => [...x, a]); setPicked((p) => [...p, a.key].slice(0, 6)); }} />
      </section>

      <section className={CARD}>
        <SectionTitle title={edit ? "Make a version for" : "First version"} hint={`Data runs to ${options.data_through}.`} />
        {/* a group, not a label: a label hands a click on its text to the first button inside it */}
        <div role="group" aria-label={edit ? "Make a version for" : "First version"}>
          {family === "reputation" || grain === "day" ? (
            // a PR deck names its period: one of the last days (the newest may still be filling), weeks or months, any day from a calendar, or a run of days (6 to 8 Oct)
            <PeriodPick key={grain} periods={periods} value={period || periods[0]?.key || ""} onChange={setPeriod} range={{ asOf: options.data_through.slice(0, 10), first: options.data_from }} day={grain === "day"} />
          ) : (
            <SelectInput withSearch size="sm" className="w-auto min-w-72 max-w-full" value={period} onChange={setPeriod} ariaLabel={edit ? "Make a version for" : "First version"}
              options={[
                { value: "", label: `Latest ${grain} the data covers${periods[0] ? ` (${periods[0].label})` : ""}` },
                // a brand deck by month can also cover the last three or six months as one period
                ...(family == null && grain === "month" ? options.runs.map((p) => ({ value: p.key, label: p.label })) : []),
                ...periods.slice(1).map((p) => ({ value: p.key, label: p.label })),
              ]} />
          )}
        </div>
        <div className="flex flex-col gap-1 border-t border-card-border pt-3">
          <Switch on={recurring} onChange={setRecurring} label={`Make the next version every ${grain}`}
            hint={`${grain === "day" ? "Each morning at 07:00 WIB, for the day before, once its data has landed" : `When a new ${grain} of data lands`}${/\.\./.test(period) ? `; the days you chose make the first version, then one ${grain} each` : ""}.`} />
          {recurring && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-13">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">Until
                <TextField type="date" className="w-44" value={until} min={options.data_through} onChange={(e) => setUntil(e.target.value)} aria-label="The last day this deck covers" />
              </label>
              <small className="text-xs text-gray-500">{until ? "then it stops, and the Decks list shows it as ended" : "empty: until you stop it from the Decks list"}</small>
            </div>
          )}
          {edit && (
            <label className="mt-2 flex cursor-pointer items-start gap-3 px-1 py-2">
              <input type="checkbox" checked={alsoTemplate} onChange={(e) => setAlsoTemplate(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-palette-600" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">Also change the template this deck came from</span>
                <span className="text-xs text-gray-500">{initial?.template?.startsWith("co-") ? "Your team's template" : "Saved as your team's own template; Fair's stays as it is"}; a Member&apos;s change waits for a Builder.</span>
              </span>
            </label>
          )}
        </div>
      </section>

      {/* the form is long: its buttons stay in reach at the bottom of the screen */}
      <div className="sticky bottom-0 z-20 flex flex-col gap-2 border-0 border-t border-gray-200 bg-gray-50 py-3">
        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto flex min-h-8 items-center gap-2 text-xs text-gray-500" aria-live="polite">
            {busy && <><Spinner />{edit ? "Saving" : "Building the deck"}: the numbers, the words, the slides… {elapsed}s (about a minute)</>}
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => router.back()}>Cancel</Button>
          {edit && <Button size="sm" variant="outline" disabled={busy} onClick={() => submit(false)}>Save</Button>}
          <Button size="sm" isLoading={busy} loadingLabel="Working…" onClick={() => submit(true)}>{edit ? "Save and make a new version" : "Create deck"}</Button>
        </div>
      </div>
    </div>
  );
}
