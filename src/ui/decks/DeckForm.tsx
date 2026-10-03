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

type Group = DeckSpec["watchlist"][number];
type Initial = { id: string; name: string; spec: DeckSpec; recurring: boolean; template: string | null };

const PLATFORMS = [{ id: "tiktok", name: "TikTok" }, { id: "instagram", name: "Instagram" }] as const;
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
  const [grain, setGrain] = useState<"week" | "month">(initial?.spec.grain ?? prefill?.grain ?? t.grain);
  const [platforms, setPlatforms] = useState<string[]>(initial?.spec.platforms ?? ["tiktok", "instagram"]);
  const [slides, setSlides] = useState<string[]>(initial?.spec.slides ?? (prefill ? [...new Set(["summary", prefill.slide, "moves", "evidence"])] : t.slides));
  const [period, setPeriod] = useState("");
  const [recurring, setRecurring] = useState(initial?.recurring ?? t.recurring);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const hasFindings = !!initial?.spec.findings?.length;
  // a PR deck: one brand's reputation, its own slides (src/reputation/)
  const isRep = edit ? !!initial?.spec.rep : t.family === "reputation";
  const [focus, setFocus] = useState(initial?.spec.rep?.focus ?? options.focus ?? options.brands[0]?.id ?? "");
  const [repPlatform, setRepPlatform] = useState(initial?.spec.rep?.platform ?? "all");
  const [repSlides, setRepSlides] = useState<string[]>(initial?.spec.rep?.slides ?? t.rep_slides ?? ["summary"]);

  // a template sets the grain, the slides and whether it recurs; the brands stay as picked
  const pickTemplate = (key: string) => {
    const x = options.templates.find((y) => y.key === key)!;
    setTemplate(key);
    setGrain(x.grain);
    setSlides(x.slides);
    setRecurring(x.recurring);
    if (x.rep_slides) setRepSlides(x.rep_slides);
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

  function spec(): DeckSpec {
    if (isRep) return { title: name.trim() || t.title, grain, platforms: [], client: null, watchlist: [], slides: ["summary"], rep: { focus, platform: repPlatform, slides: repSlides as NonNullable<DeckSpec["rep"]>["slides"] } };
    return {
      title: name.trim() || t.title,
      grain,
      platforms: platforms as DeckSpec["platforms"],
      client: clientOn && clientName.trim() && clientIds.length ? { name: clientName.trim(), brands: clientIds.map((id) => ({ name: brandName.get(id) ?? id, brand_ids: [id] })) } : null,
      watchlist: watch,
      slides: slides as DeckSpec["slides"],
      ...(initial?.spec.findings ? { findings: initial.spec.findings } : {}),
    };
  }

  async function submit(andBuild: boolean) {
    setError("");
    if (isRep && !focus) { setError("Pick the brand this deck is about."); return; }
    if (!isRep && !watch.length) { setError(t.brands === "focus" ? "Pick the brand (or brands) this deck is about." : "Pick at least one brand to watch."); return; }
    if (!isRep && !platforms.length) { setError("Pick TikTok, Instagram or both."); return; }
    setBusy(true);
    setElapsed(0);
    try {
      if (!edit) {
        const r = await fetch("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || t.name, template, spec: spec(), recurring, period: period || undefined }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.deck) throw new Error(j.error ?? "Could not make the deck");
        router.push(`/decks/${j.deck.id}${j.version?.report_id ? `?v=${j.version.report_id}` : ""}`);
        return;
      }
      const r = await fetch(`/api/decks/${initial!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || initial!.name, spec: spec(), recurring }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save");
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

  return (
    <div className="deckform">
      {!edit && (
        <section>
          <h3>Start from</h3>
          <div className="tpls">
            {options.templates.map((x) => (
              <button key={x.key} type="button" className={template === x.key ? "on" : ""} onClick={() => pickTemplate(x.key)}>
                <b>{x.name}</b><span>{x.description}</span>
                <small>{x.grain === "month" ? "Month on month" : "Week on week"} · {(x.rep_slides ?? x.slides).length} slide types</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="cgrid">
        <label className="wf"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={initial?.name ?? t.title} maxLength={80} /></label>
        <div className="wf">
          <span>Compare</span>
          <div className="seg">
            <button type="button" className={grain === "week" ? "on" : ""} onClick={() => setGrain("week")}>Week on week</button>
            <button type="button" className={grain === "month" ? "on" : ""} onClick={() => setGrain("month")}>Month on month</button>
          </div>
        </div>
        <div className="wf">
          <span>Platforms</span>
          {isRep ? (
            <div className="seg">
              {["all", ...options.platforms].map((p) => (
                <button key={p} type="button" className={repPlatform === p ? "on" : ""} onClick={() => setRepPlatform(p)}>{p === "all" ? "All" : PLATFORM_NAME[p] ?? p}</button>
              ))}
            </div>
          ) : (
            <div className="seg">
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" className={platforms.includes(p.id) ? "on" : ""} onClick={() => setPlatforms((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}>{p.name}</button>
              ))}
            </div>
          )}
        </div>
      </section>

      {isRep && (
        <>
          <section className="cgrid">
            <label className="wf"><span>The brand this deck is about</span>
              <select value={focus} onChange={(e) => setFocus(e.target.value)}>
                {options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.id === options.focus ? " (you)" : ""}</option>)}
              </select>
            </label>
          </section>
          <section>
            <h3>Slides <small>{repSlides.length} picked; every other brand is the benchmark</small></h3>
            <div className="slidepick">
              {options.rep_slides.map((s) => {
                const locked = s.kind === "summary";
                return (
                  <label key={s.kind} className={repSlides.includes(s.kind) ? "on" : ""}>
                    <input type="checkbox" checked={locked || repSlides.includes(s.kind)} disabled={locked} onChange={() => setRepSlides((x) => (x.includes(s.kind) ? x.filter((y) => y !== s.kind) : [...x, s.kind]))} />
                    <span><b>{s.title}</b><em>{s.description}</em></span>
                  </label>
                );
              })}
            </div>
          </section>
        </>
      )}

      {!isRep && (
        <>
      <section>
        <h3>{t.brands === "focus" && !edit ? "The brands this deck is about" : "Brands to watch"}</h3>
        <div className="dgroups">
          {watch.map((w, i) => (
            <span key={`${w.name}-${i}`} className="ms-chip">
              {w.name}{w.brand_ids.length > 1 ? ` (${w.brand_ids.length} brands)` : ""}
              <i title="Remove" onClick={() => setWatch((x) => x.filter((_, j) => j !== i))}>×</i>
            </span>
          ))}
        </div>
        <MultiSelect options={options.brands.filter((b) => !taken.has(b.id))} value={[]} onChange={addBrands} placeholder={watch.length ? "Add another brand…" : "Search brands…"} />
        {options.starter && !edit && (
          <button type="button" className="linkbtn" onClick={() => { setWatch(options.starter!.watchlist); if (options.starter!.client) { setClientOn(true); setClientName(options.starter!.client.name); setClientIds(options.starter!.client.brands.flatMap((b) => b.brand_ids)); } }}>
            Use the watchlist of {options.starter.label}
          </button>
        )}
      </section>

      <section>
        <label className="dcheck"><input type="checkbox" checked={clientOn} onChange={(e) => setClientOn(e.target.checked)} /> Prepared for a client <small>(the moves are written for them; their brands get an appendix)</small></label>
        {clientOn && (
          <div className="cgrid">
            <label className="wf"><span>Client</span><input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Paragon" maxLength={60} /></label>
            <div className="wf wide"><span>The client&apos;s brands</span><MultiSelect options={options.brands.filter((b) => !watch.some((w) => w.brand_ids.includes(b.id)))} value={clientIds} onChange={setClientIds} placeholder="Search brands…" /></div>
          </div>
        )}
      </section>

      <section>
        <h3>Slides <small>{slides.length} picked; they print in this order</small></h3>
        <div className="slidepick">
          {options.slides.filter((s) => s.kind !== "findings" || hasFindings).map((s) => {
            const locked = !!s.required;
            const blocked = s.needs === "client" && !clientOn;
            return (
              <label key={s.kind} className={`${slides.includes(s.kind) && !blocked ? "on" : ""} ${blocked ? "off" : ""}`}>
                <input type="checkbox" checked={locked || (slides.includes(s.kind) && !blocked)} disabled={locked || blocked} onChange={() => toggleSlide(s.kind)} />
                <span><b>{s.title}<small>{[s.pages === "1" ? "" : s.pages, blocked ? "needs a client" : ""].filter(Boolean).join(" · ")}</small></b><em>{s.description}</em></span>
              </label>
            );
          })}
        </div>
      </section>

        </>
      )}

      <section className="cgrid">
        <label className="wf">
          <span>{edit ? "Make a version for" : "First version"}</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Latest {grain} the data covers{periods[0] ? ` (${periods[0].label})` : ""}</option>
            {periods.slice(1).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="dcheck wide"><input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} /> Make the next version every {grain} <small>(when a new {grain} of data lands; data runs to {options.data_through})</small></label>
      </section>

      {error && <div className="errbox">{error}</div>}
      <div className="wactions">
        {busy && <span className="muted">{edit ? "Saving" : "Building the deck"}: the numbers, the words, the slides… {elapsed}s (about a minute)</span>}
        <button className="btn sm ghost" disabled={busy} onClick={() => router.back()}>Cancel</button>
        {edit && <button className="btn sm" disabled={busy} onClick={() => submit(false)}>Save</button>}
        <button className="btn pri sm" disabled={busy} onClick={() => submit(true)}>{busy ? "Working…" : edit ? "Save and make a new version" : "Create deck"}</button>
      </div>
    </div>
  );
}
