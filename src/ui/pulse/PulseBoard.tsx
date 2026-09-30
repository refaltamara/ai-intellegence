"use client";
/**
 * A Pulse: the team's board for one situation. Cards read their numbers on the
 * server; here they are laid out on a 12-column grid, dragged into order,
 * resized, edited, removed, and added. Outside edit mode it is a clean page with
 * "Ask why" on every number, as on the Dashboard.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KIND_INFO, METRIC_LABEL, type CardSize } from "@/pulses/kinds";
import type { RenderedCard } from "@/pulses/cards";
import { CardBody } from "./CardBody";
import { CardEditor, type Options } from "./CardEditor";

function defaultTitle(c: RenderedCard): string {
  if (c.title) return c.title;
  if (c.kind === "kpi") return METRIC_LABEL[c.config.metric ?? "views"];
  if (c.kind === "creators") return `Top creators by ${c.config.by === "comments" ? "comments" : "views"}`;
  if (c.kind === "skill" && c.data.kind === "skill") return c.data.title;
  return KIND_INFO[c.kind].label;
}

export function PulseBoard({ pulse, cards, options, panel }: { pulse: { id: string; name: string; description: string | null }; cards: RenderedCard[]; options: Options; panel: boolean }) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(cards.map((c) => c.id));
  // the server's order wins whenever the cards come back (after an add, a remove or a refresh), and edit mode stays on
  const serverOrder = cards.map((c) => c.id).join(",");
  useEffect(() => { setOrder(serverOrder ? serverOrder.split(",") : []); }, [serverOrder]);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editCard, setEditCard] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(pulse.name);
  const [toast, setToast] = useState("");
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2400); };
  const byId = new Map(cards.map((c) => [c.id, c]));
  const shown = [...order.filter((id) => byId.has(id)), ...cards.map((c) => c.id).filter((id) => !order.includes(id))].map((id) => byId.get(id)!);
  const names = new Map(options.brands.map((b) => [b.id, b.name]));

  async function call(url: string, method: string, body?: unknown) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `Failed (${r.status})`);
    return j;
  }
  async function act(key: string, f: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try { await f(); if (done) show(done); router.refresh(); } catch (e) { show((e as Error).message); }
    setBusy(null);
  }
  function moveBefore(target: string) {
    if (!dragged || dragged === target) return;
    const ids = shown.map((c) => c.id).filter((id) => id !== dragged);
    ids.splice(ids.indexOf(target), 0, dragged);
    setOrder(ids);
  }
  async function saveOrder(ids = shown.map((c) => c.id)) {
    setDragged(null);
    await call(`/api/pulses/${pulse.id}/cards`, "PUT", { ids }).catch((e) => show((e as Error).message));
  }
  /** move a card one place earlier or later, for people who would rather not drag */
  function nudge(id: string, by: -1 | 1) {
    const ids = shown.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    void saveOrder(ids);
  }

  return (
    <section className="screen pulseboard">
      <div className="topbar">
        <div>
          {editing ? <input className="pname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== pulse.name && act("name", () => call(`/api/pulses/${pulse.id}`, "PATCH", { name }), "Renamed")} maxLength={80} aria-label="Pulse name" />
            : <h1>{pulse.name}</h1>}
          <span className="meta"><Link href="/pulse">Pulses</Link> · {pulse.description ?? "Your team's board"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {panel && <button className="btn sm" onClick={() => { setAdding(true); setEditing(true); }}>+ Add card</button>}
          <button className={`btn sm ${editing ? "pri" : ""}`} onClick={() => { setEditing((e) => !e); setAdding(false); setEditCard(null); }}>{editing ? "Done" : "Edit layout"}</button>
        </div>
      </div>
      <div className="wrap wide">
        {adding && (
          <div className="dcard addcard">
            <h3>Add a card</h3>
            <CardEditor options={options} busy={busy === "add"} onCancel={() => setAdding(false)} onSave={(v) => act("add", async () => { await call(`/api/pulses/${pulse.id}/cards`, "POST", v); setAdding(false); }, "Card added")} />
          </div>
        )}
        {shown.length === 0 && !adding && (
          <div className="empty pempty">
            <b>This Pulse is empty.</b>
            <span>{panel ? "Add a card above, press “+ Add to a Pulse” on a Dashboard section, or on any answer in Chats." : "Press “+ Add to a Pulse” under any answer in Chats to pin it here."}</span>
          </div>
        )}
        <div className={`pgrid ${editing ? "editing" : ""}`}>
          {shown.map((c) => (
            <div key={c.id} className={`pcard size-${c.size} ${dragged === c.id ? "dragging" : ""}`}
              draggable={editing} onDragStart={(e) => { setDragged(c.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (dragged) { e.preventDefault(); moveBefore(c.id); } }} onDrop={(e) => { e.preventDefault(); void saveOrder(); }} onDragEnd={() => dragged && void saveOrder()}>
              <header>
                {editing && <span className="grip" title="Drag to move" aria-hidden>⋮⋮</span>}
                <div className="t"><h3>{defaultTitle(c)}</h3>{c.scope && <span>{c.scope}</span>}</div>
                {editing && (
                  <div className="ctl">
                    <button onClick={() => nudge(c.id, -1)} title="Move earlier" aria-label="Move earlier">←</button>
                    <button onClick={() => nudge(c.id, 1)} title="Move later" aria-label="Move later">→</button>
                    {(["s", "m", "l"] as CardSize[]).map((s) => <button key={s} className={c.size === s ? "on" : ""} title={s === "s" ? "A third" : s === "m" ? "Half" : "Full width"} onClick={() => act(c.id + s, () => call(`/api/pulses/cards/${c.id}`, "PATCH", { size: s }))}>{s.toUpperCase()}</button>)}
                    {c.kind !== "skill" && <button onClick={() => setEditCard(editCard === c.id ? null : c.id)} title="Change what it shows">Edit</button>}
                    <button className="rm" title="Remove" onClick={() => { if (confirm("Remove this card?")) act(c.id + "rm", () => call(`/api/pulses/cards/${c.id}`, "DELETE"), "Card removed"); }}>×</button>
                  </div>
                )}
              </header>
              {editCard === c.id ? (
                <CardEditor options={options} initial={{ kind: c.kind, title: c.title, size: c.size, config: c.config }} busy={busy === c.id + "edit"} onCancel={() => setEditCard(null)}
                  onSave={(v) => act(c.id + "edit", async () => { await call(`/api/pulses/cards/${c.id}`, "PATCH", { title: v.title, size: v.size, config: v.config }); setEditCard(null); }, "Card saved")} />
              ) : (
                <div className="body"><CardBody card={c} names={names} refreshing={busy === c.id + "refresh"} onRefresh={c.kind === "skill" ? () => act(c.id + "refresh", () => call(`/api/pulses/cards/${c.id}/refresh`, "POST"), "Refreshed") : undefined} /></div>
              )}
            </div>
          ))}
        </div>
        {editing && (
          <div className="pdanger">
            <button className="btn sm ghost" onClick={() => { if (confirm(`Delete “${pulse.name}” and its cards?`)) act("del", async () => { await call(`/api/pulses/${pulse.id}`, "DELETE"); router.push("/pulse"); }); }}>Delete this Pulse</button>
          </div>
        )}
      </div>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </section>
  );
}
