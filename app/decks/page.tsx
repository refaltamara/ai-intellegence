/**
 * Decks (DECISIONS, 2 Oct 2026): slide decks the team builds from a template, from scratch or from a
 * conversation in Chats, each with its versions, Ask AI on every slide and, if asked, a new version every
 * week or month. The client's Weekly Competitor Pulse stays on its own page (Weekly Reports). Pulse boards
 * made before Decks are listed at the bottom.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentRole, currentWorkspaceId } from "@/auth/current";
import { listDecks } from "@/decks/store";
import { deckTemplate } from "@/decks/templates";
import { panelWorkspace } from "@/pulses/api";
import { listPulses } from "@/pulses/store";
import { weeklyItems } from "@/reports/weekly";
import { DeckList } from "@/ui/decks/DeckList";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });

export default async function DecksPage() {
  const ws = await currentWorkspaceId();
  if (!(await panelWorkspace(ws))) redirect("/pulse");
  const [all, weekly0, pulses, role] = await Promise.all([listDecks(ws), weeklyItems(ws), listPulses(ws), currentRole(ws)]);
  // each role keeps its own decks: PR decks are about one brand's reputation (spec.rep), the rest are Brand & KOL's
  const pr = role.id === "pr";
  const decks = all.filter((d) => !!d.spec?.rep === pr);
  const weekly = pr ? [] : weekly0;
  const clients = [...new Set(weekly.map((w) => w.client))];
  const boards = pulses.filter((p) => p.cards > 0);
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Decks</h1><span className="meta">Slide decks from a template, from scratch or from Chats: actual slides, Ask AI on each, PDF and PowerPoint, and a new version every week or month if you want one.</span></div>
        <Link className="btn pri sm" href="/decks/new">+ New deck</Link>
      </div>
      <div className="wrap wide">
        {weekly.length > 0 && (
          <Link href="/weekly" className="dpinned">
            <span className="dkind">Weekly Reports</span>
            <b>{weekly[0].deck}{clients.length === 1 ? ` · ${clients[0]}` : ""}</b>
            <span>{weekly.length} week{weekly.length === 1 ? "" : "s"}, latest {weekly[weekly.length - 1].label}. Kept on its own page for presenting.</span>
          </Link>
        )}
        {decks.length > 0 ? (
          <DeckList decks={decks.map((d) => ({
            id: d.id,
            name: d.name,
            kind: deckTemplate(d.template)?.name ?? (d.source === "chat" ? "From Chats" : d.source === "pulse" ? "From a Pulse board" : "Deck"),
            latest: d.latest?.label ?? null,
            meta: `${d.spec.grain === "month" ? "Month on month" : "Week on week"} · ${d.spec.watchlist.map((w) => w.name).slice(0, 4).join(", ")}${d.spec.watchlist.length > 4 ? ` +${d.spec.watchlist.length - 4}` : ""} · ${d.versions} version${d.versions === 1 ? "" : "s"} · updated ${day(d.updated_at)}`,
            recurring: d.recurring ? `A new version every ${d.spec.grain}` : null,
            error: d.last_error,
          }))} />
        ) : (
          <div className="empty">No decks yet. <Link href="/decks/new">Start one from a template</Link>{pr ? ": the Weekly Reputation Report is the one to send up every week." : ", or ask CeMO something in Chats and turn the conversation into a deck."}</div>
        )}
        {boards.length > 0 && (
          <div className="dold">
            <h3>Pulse boards</h3>
            <p className="muted">Boards made before Decks. They still open and refresh; new work goes into decks.</p>
            <ul>{boards.map((p) => <li key={p.id}><Link href={`/pulse/${p.id}`}>{p.name}</Link> <small>{p.cards} cards · updated {day(p.updated_at)}</small></li>)}</ul>
          </div>
        )}
      </div>
    </section>
  );
}
