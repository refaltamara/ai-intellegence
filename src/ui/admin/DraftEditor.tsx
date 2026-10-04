"use client";
/** A draft's fields, for role owners: CeMO's voice and first screen, the analyses and decks it offers, its thresholds. */
import { useState } from "react";
import { useAdminCall } from "./useAdminCall";

type Spec = { description: string; voice: string; hero_title: string; hero_intro: string; suggested: string[]; recipes: string[]; deck_templates: string[]; skill_order: string[]; alert: Record<string, number> | null; watch: Record<string, number> | null };

export function DraftEditor({ role, version, canEdit, spec, recipes, templates }: { role: string; version: string; canEdit: boolean; spec: Spec; recipes: { key: string; title: string; description: string }[]; templates: { key: string; name: string }[] }) {
  const { busy, error, call } = useAdminCall();
  const [s, setS] = useState<Spec>(spec);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof Spec>(k: K, v: Spec[K]) => { setS({ ...s, [k]: v }); setSaved(false); };
  const toggle = (k: "recipes" | "deck_templates", key: string) => set(k, s[k].includes(key) ? s[k].filter((x) => x !== key) : [...s[k], key]);
  const num = (block: "alert" | "watch", k: string, v: string) => set(block, { ...(s[block] ?? {}), [k]: Number(v) });
  async function save() {
    const patch = { ...s, hero_title: s.hero_title || undefined, hero_intro: s.hero_intro || undefined, alert: s.alert ?? undefined, watch: s.watch ?? undefined };
    if (await call("save", { action: "save", role, version, patch })) setSaved(true);
  }
  return (
    <div className="cmsblock draft">
      <header><h2>Draft</h2><span className="hint">Saving puts a proposal back to draft; tests run again after every change.</span></header>
      <div className="draftgrid card">
        <label className="wide">Description<textarea rows={2} value={s.description} onChange={(e) => set("description", e.target.value)} disabled={!canEdit} /></label>
        <label className="wide">CeMO&apos;s voice on this team<textarea rows={6} value={s.voice} onChange={(e) => set("voice", e.target.value)} disabled={!canEdit} placeholder="Empty: CeMO uses the workspace's own persona." /></label>
        <label>Chats title<input value={s.hero_title} onChange={(e) => set("hero_title", e.target.value)} disabled={!canEdit} placeholder="the workspace's own" /></label>
        <label>Chats intro<input value={s.hero_intro} onChange={(e) => set("hero_intro", e.target.value)} disabled={!canEdit} placeholder="the workspace's own" /></label>
        <label className="wide">Suggested questions, one per line ({"{{client}}"} is the client brand)<textarea rows={4} value={s.suggested.join("\n")} onChange={(e) => set("suggested", e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))} disabled={!canEdit} /></label>
        <fieldset className="wide"><legend>Analyses this team offers (recipes)</legend>
          {recipes.length ? recipes.map((r) => <label key={r.key} className="tick"><input type="checkbox" checked={s.recipes.includes(r.key)} onChange={() => toggle("recipes", r.key)} disabled={!canEdit} /> <b>{r.title}</b> <small>{r.description}</small></label>) : <small>No recipe is built for this role yet.</small>}
        </fieldset>
        <fieldset className="wide"><legend>Deck templates</legend>
          {templates.map((t) => <label key={t.key} className="tick"><input type="checkbox" checked={s.deck_templates.includes(t.key)} onChange={() => toggle("deck_templates", t.key)} disabled={!canEdit} /> {t.name}</label>)}
        </fieldset>
        <label>Composer order (layers, comma-separated)<input value={s.skill_order.join(", ")} onChange={(e) => set("skill_order", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} disabled={!canEdit} /></label>
        {s.alert && (
          <fieldset><legend>Status ladder</legend>
            <label>Issue at × the norm<input type="number" step="0.1" value={s.alert.negative_multiple} onChange={(e) => num("alert", "negative_multiple", e.target.value)} disabled={!canEdit} /></label>
            <label>Comments a day, at least<input type="number" value={s.alert.min_comments} onChange={(e) => num("alert", "min_comments", e.target.value)} disabled={!canEdit} /></label>
            <label>Norm over days<input type="number" value={s.alert.baseline_days} onChange={(e) => num("alert", "baseline_days", e.target.value)} disabled={!canEdit} /></label>
          </fieldset>
        )}
        {s.watch && (
          <fieldset><legend>Needs attention</legend>
            <label>Underperforms below % of usual<input type="number" value={s.watch.underperform_pct} onChange={(e) => num("watch", "underperform_pct", e.target.value)} disabled={!canEdit} /></label>
            <label>Comment storm at negative<input type="number" value={s.watch.storm_negative} onChange={(e) => num("watch", "storm_negative", e.target.value)} disabled={!canEdit} /></label>
            <label>Posts before an account is judged<input type="number" value={s.watch.min_account_posts} onChange={(e) => num("watch", "min_account_posts", e.target.value)} disabled={!canEdit} /></label>
          </fieldset>
        )}
        {canEdit && <div className="wide row"><button className="btn pri" onClick={save} disabled={!!busy}>{busy ? "Saving…" : "Save draft"}</button>{saved && <span className="hint">Saved. Run the tests again.</span>}</div>}
        {error && <div className="errbox wide">{error}</div>}
      </div>
    </div>
  );
}
