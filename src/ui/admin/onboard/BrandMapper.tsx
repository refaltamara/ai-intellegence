"use client";
/**
 * Map the dump's accounts to brands (CMS plan, "Map brands"): the accounts found, grouped
 * by suggestion, for data ops to confirm, merge ("BCA + blu by BCA") or split; each brand's
 * terms (what names it in a caption) and the client brand.
 */
import { useMemo, useState } from "react";
import { useOnboard } from "./useOnboard";

type Handle = { handle: string; platforms: string[]; posts: number; brand: string | null };
type Brand = { id: string; name: string; handles: string[]; terms: string[]; never: string[] };

export function BrandMapper({ ws, handles, suggestions, current, client }: { ws: string; handles: Handle[]; suggestions: { id: string; name: string; handles: { handle: string }[] }[]; current: Record<string, { name: string; handles: string[]; terms: string[]; never?: string[] }>; client: string | null }) {
  const { busy, error, call } = useOnboard(ws);
  const initial: Brand[] = Object.keys(current).length
    ? Object.entries(current).map(([id, b]) => ({ id, name: b.name, handles: b.handles.map((h) => h.toLowerCase()), terms: b.terms, never: b.never ?? [] }))
    : [];
  const [brands, setBrands] = useState<Brand[]>(initial);
  const [cl, setCl] = useState(client ?? "");
  const [saved, setSaved] = useState(false);
  // rows start again when the suggestions replace them (their text fields keep their own state)
  const [gen, setGen] = useState(0);
  const owner = useMemo(() => new Map(brands.flatMap((b) => b.handles.map((h) => [h, b.id] as const))), [brands]);
  const useSuggestions = () => {
    setBrands(suggestions.map((s) => ({ id: s.id.replace(/[^a-z0-9_.-]/g, ""), name: s.name, handles: s.handles.map((h) => h.handle), terms: [s.id], never: [] })));
    setGen((g) => g + 1);
    setSaved(false);
  };
  const move = (h: string, to: string) => {
    setBrands((bs) => bs.map((b) => ({ ...b, handles: b.id === to ? [...new Set([...b.handles, h])] : b.handles.filter((x) => x !== h) })));
    setSaved(false);
  };
  const set = (i: number, patch: Partial<Brand>) => { setBrands((bs) => bs.map((b, k) => (k === i ? { ...b, ...patch } : b))); setSaved(false); };
  const add = () => { setBrands((bs) => [...bs, { id: `brand${bs.length + 1}`, name: "New brand", handles: [], terms: [], never: [] }]); setSaved(false); };
  const remove = (i: number) => { setBrands((bs) => bs.filter((_, k) => k !== i)); setGen((g) => g + 1); setSaved(false); };
  const unmapped = handles.filter((h) => !owner.has(h.handle));
  async function save() {
    const body = Object.fromEntries(brands.filter((b) => b.handles.length || b.terms.length).map((b) => [b.id, { name: b.name, handles: b.handles, terms: b.terms, never: b.never }]));
    const r = await call("brands", { brands: body, client: cl || null });
    if (r) setSaved(true);
  }
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="mapper">
      <div className="row">
        <button className="btn sm" onClick={useSuggestions}>{brands.length ? "Start again from the suggestions" : "Use the suggested grouping"}</button>
        <button className="btn sm ghost" onClick={add}>Add a brand</button>
        <span className="muted">{handles.length} accounts in the dump{unmapped.length ? ` · ${unmapped.length} not under a brand yet` : " · all under a brand"}</span>
      </div>
      {unmapped.length > 0 && (
        <div className="unmapped">
          {unmapped.map((h) => (
            <span key={h.handle} className="tag">@{h.handle} <small>{h.platforms.join(", ")} · {h.posts}</small>
              <select value="" onChange={(e) => e.target.value && move(h.handle, e.target.value)}><option value="">→ brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </span>
          ))}
        </div>
      )}
      <div className="tablewrap people"><table>
        <thead><tr><th>Id</th><th>Name</th><th>Accounts (owned; also how captured posts find their brand)</th><th>Terms that name it in a caption</th><th>Never counts</th><th>Client</th><th /></tr></thead>
        <tbody>{brands.map((b, i) => (
          <tr key={`${gen}-${i}`}>
            <td><input className="mini" value={b.id} onChange={(e) => set(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, "") })} /></td>
            <td><input className="mini" value={b.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
            <td>{b.handles.map((h) => (
              <span key={h} className="tag">@{h} <select value={b.id} onChange={(e) => move(h, e.target.value)}>{brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></span>
            ))}{!b.handles.length && <span className="muted">none</span>}</td>
            <td><input className="wide" defaultValue={b.terms.join(", ")} onBlur={(e) => set(i, { terms: list(e.target.value) })} placeholder="gopay, go-pay, go pay" /></td>
            <td><input className="wide" defaultValue={b.never.join(", ")} onBlur={(e) => set(i, { never: list(e.target.value) })} placeholder="go pay attention" /></td>
            <td><input type="radio" name="client" checked={cl === b.id} onChange={() => { setCl(b.id); setSaved(false); }} /></td>
            <td><button className="linkbtn danger" onClick={() => remove(i)}>Remove</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="muted">A term matches at the start of a word, any case; written in capitals (&quot;DANA&quot;) it matches only in capitals, as a whole word. Handles count as terms too. A brand id is fixed once the workspace is live.</p>
      <div className="row end">
        {error && <span className="err">{error}</span>}
        {saved && !error && <span className="ok">Saved.</span>}
        <label className="tick"><input type="radio" name="client" checked={!cl} onChange={() => setCl("")} /> No client brand</label>
        <button className="btn pri sm" disabled={!!busy || !brands.length} onClick={save}>Save brands</button>
      </div>
    </div>
  );
}
