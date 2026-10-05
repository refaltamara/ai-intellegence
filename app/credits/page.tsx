/**
 * Credits for a workspace's Builders (CMS plan, "Credits and billing"): this month against
 * the pool and the cap, use by person, kind and day, and the cap they may set. Credits,
 * never dollars. Members and anyone else are sent back to Chats.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { getWorkspace } from "@/workspace/store";
import { monthState, useBreakdown } from "@/credits/ledger";
import { CREDIT_PRICES } from "@/config/credits";
import { Act } from "@/ui/company/Act";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { question: "Questions to CeMO", builder_turn: "Builder mode", creation: "Things CeMO made", deck_version: "Deck versions", extension_row: "Extensions read by CeMO", topup: "Top-ups", adjust: "Notes" };
/** credits: whole numbers as they are, half credits (an extension's rows) with their decimal */
const n = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? Math.round(x).toLocaleString("en-US") : x.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 }));

export default async function CreditsPage() {
  const ws = await currentWorkspaceId();
  const [actor, cfg] = await Promise.all([currentActor(), getWorkspace(ws)]);
  const roles = cfg?.roles ?? [];
  if (!actor || !roles.some((r) => can(actor, "company.change", { workspace: ws, role: r }))) redirect("/");
  const [st, use] = await Promise.all([monthState(ws), useBreakdown(ws, 30)]);
  const pct = Math.min(100, Math.round(st.share * 100));
  const maxDay = Math.max(1, ...use.by_day.map((d) => d.credits));
  return (
    <section className="screen credits">
      <div className="topbar"><div><h1>Credits</h1><span className="meta">{cfg?.name} · {st.month} · shared by everyone in the workspace</span></div></div>
      <div className="wrap">
        <div className="dcard credhero">
          <div className="big"><b>{n(st.spent)}</b><span>of {n(st.limit)} credits used this month</span></div>
          <div className={`bar ${st.share >= 1 ? "full" : st.share >= 0.8 ? "warn" : ""}`}><i style={{ width: `${pct}%` }} /></div>
          <p className="muted">
            Pool {n(st.pool)}{st.topups ? ` + ${n(st.topups)} topped up` : ""}{st.cap != null ? ` · your cap ${n(st.cap)}` : ""} · {n(st.remaining)} left.{" "}
            {st.enforce ? "At the limit, CeMO and anything that uses it stop until next month; dashboards keep working." : "Credits are recorded but nothing stops yet: Fair turns billing on when your plan starts."}
          </p>
          <div className="acts left">
            <Act label={st.cap != null ? "Change the cap" : "Set a monthly cap"} className="btn sm" url="/api/builder/credits" body={{}} ask="Monthly cap in credits (empty for none)" />
            {st.cap != null && <Act label="Remove the cap" url="/api/builder/credits" body={{ cap: null }} />}
          </div>
        </div>

        <div className="two-eq">
          <div className="dsection">
            <header><h2>By person</h2><span>The last 30 days.</span></header>
            <div className="dcard tablewrap still"><table><thead><tr><th>Who</th><th className="num">Credits</th><th className="num">Actions</th></tr></thead>
              <tbody>{use.by_person.map((p) => <tr key={p.email ?? "-"}><td>{p.email ?? "Scheduled work"}</td><td className="num">{n(p.credits)}</td><td className="num">{n(p.actions)}</td></tr>)}{!use.by_person.length && <tr><td colSpan={3} className="muted">Nothing used yet.</td></tr>}</tbody></table></div>
          </div>
          <div className="dsection">
            <header><h2>By kind</h2><span>What the credits went on.</span></header>
            <div className="dcard tablewrap still"><table><thead><tr><th>Kind</th><th className="num">Credits</th><th className="num">Actions</th></tr></thead>
              <tbody>{use.by_kind.map((k) => <tr key={k.kind}><td>{KIND[k.kind] ?? k.kind}</td><td className="num">{n(k.credits)}</td><td className="num">{n(k.actions)}</td></tr>)}{!use.by_kind.length && <tr><td colSpan={3} className="muted">Nothing used yet.</td></tr>}</tbody></table></div>
          </div>
        </div>

        <div className="dsection">
          <header><h2>By day</h2><span>The last 30 days.</span></header>
          <div className="dcard"><div className="credays">{use.by_day.map((d) => <i key={d.day} title={`${d.day}: ${n(d.credits)} credits`} style={{ height: `${Math.max(3, (d.credits / maxDay) * 100)}%` }} />)}{!use.by_day.length && <span className="muted">No use yet.</span>}</div></div>
        </div>

        <div className="dsection">
          <header><h2>What costs credits</h2><span>Dashboards, filters, settings, approvals and exports are free. Prices may change once Fair has a month of measured cost.</span></header>
          <div className="dcard tablewrap still"><table><tbody>
            <tr><td>A question to CeMO</td><td className="num">{CREDIT_PRICES.question}</td></tr>
            <tr><td>A turn in Builder mode</td><td className="num">{CREDIT_PRICES.builder_turn}</td></tr>
            <tr><td>Something CeMO makes for the team (skill, template, rule, extension)</td><td className="num">{CREDIT_PRICES.creation}</td></tr>
            <tr><td>A deck version</td><td className="num">{CREDIT_PRICES.deck_version}</td></tr>
            <tr><td>An extension CeMO fills, per 1,000 rows read (always estimated before it runs)</td><td className="num">{n(CREDIT_PRICES.extension_row * 1000)}</td></tr>
          </tbody></table></div>
        </div>

        <div className="dsection">
          <header><h2>Latest</h2></header>
          <div className="dcard tablewrap still"><table><thead><tr><th>When (WIB)</th><th>Who</th><th>What</th><th className="num">Credits</th></tr></thead>
            <tbody>{use.recent.map((r, i) => <tr key={i}><td className="muted">{new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}</td><td>{r.email ?? "–"}</td><td>{KIND[r.kind] ?? r.kind}{r.note ? <small className="muted"> · {r.note}</small> : null}</td><td className="num">{r.kind === "adjust" ? "–" : r.credits > 0 ? `+${n(r.credits)}` : n(-r.credits)}</td></tr>)}</tbody></table></div>
        </div>
        <p className="muted foot">Need more this month? Ask your Fair contact for a top-up. <Link href="/company">Back to your team&apos;s version</Link></p>
      </div>
    </section>
  );
}
