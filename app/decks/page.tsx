/**
 * Decks (DECISIONS, 2 Oct 2026): slide decks the team builds from a template, from scratch or from a
 * conversation in Chats, each with its versions, Ask AI on every slide and, if asked, a new version every
 * day, week or month. Since 16 Oct 2026 one list with each deck's status (monitoring until a day or until
 * stopped, paused, ended, one-off; src/decks/status.ts); the client's Weekly Competitor Pulse is a row in it
 * (Weekly Reports left the sidebar; its viewer still opens). Pulse boards made before Decks are listed at the bottom.
 */
import Link from "next/link";
import { currentRole, currentWorkspaceId } from "@/auth/current";
import { listDecks } from "@/decks/store";
import { deckTemplate } from "@/decks/templates";
import { deckWorkspace } from "@/pulses/api";
import { listPulses } from "@/pulses/store";
import { weeklyItems } from "@/reports/weekly";
import { DeckList, type DeckItem } from "@/ui/decks/DeckList";
import { deckStatus, dateLabel } from "@/decks/status";
import { listAgents } from "@/agents/store";
import { sql } from "@/db/client";
import { PageHeader } from "@/ui/kit/PageHeader";
import { buttonClass } from "@/ui/kit/Button";
import { IconPlus } from "@/ui/kit/icons";

export const dynamic = "force-dynamic";

const EMPTY = "rounded-3xl border border-card-border bg-white p-6 text-sm text-gray-700";
const LINK = "font-semibold text-brand-palette-700 underline-offset-2 hover:text-brand-palette-800 hover:underline";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });

export default async function DecksPage() {
  const ws = await currentWorkspaceId();
  // a one-person profile that is not on the reputation dashboard has no decks yet: Decks says so (it stays one of the four places)
  if (!(await deckWorkspace(ws))) {
    return (
      <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-6 md:px-6">
        <PageHeader title="Decks" subtitle="Slide decks from a template, from scratch or from Chats." />
        <p className={EMPTY}>Decks are not available on this workspace yet: its data is watched hour by hour on the Dashboard. <Link className={LINK} href="/reports">Reports from Chats</Link> are kept on their own page.</p>
      </section>
    );
  }
  const [all, weekly0, pulses, role, agents, brandRows] = await Promise.all([listDecks(ws), weeklyItems(ws), listPulses(ws), currentRole(ws), listAgents(ws), sql.query("select id, name from brands where workspace_id = $1", [ws]).then((r) => r as { id: string; name: string }[])]);
  const brandName = new Map(brandRows.map((b) => [b.id, b.name]));
  // each role keeps its own decks: PR decks are one brand's reputation (spec.rep), Social Media decks its own accounts (spec.social), the rest Brand & KOL's
  const pr = role.id === "pr";
  const family = (d: (typeof all)[number]) => (d.spec?.rep ? "pr" : d.spec?.social ? "social" : "brand_kol");
  const decks = all.filter((d) => family(d) === role.id);
  // the client's weekly report schedule (an agent) is a Brand & KOL row, opening the Weekly Reports viewer
  const weekly = role.id === "brand_kol" ? weekly0 : [];
  const schedules = role.id === "brand_kol" ? agents.filter((a) => a.kind === "weekly_report") : [];
  const boards = pulses.filter((p) => p.cards > 0);
  const every = (g: string) => (g === "month" ? "Monthly" : g === "day" ? "Daily" : "Weekly");
  const names = (w: { name: string }[]) => `${w.slice(0, 4).map((x) => x.name).join(", ")}${w.length > 4 ? ` +${w.length - 4}` : ""}`;
  const items: DeckItem[] = [
    ...schedules.map((a): DeckItem => {
      const c = (a.params as { contract?: { watchlist?: { name: string }[] } }).contract;
      const mine = weekly;
      const st = a.status === "active" ? { state: "monitoring" as const, label: "Monitoring", detail: `${a.schedule_human ?? "every week"} until stopped${a.next_run_at ? `; next ${dateLabel(a.next_run_at.slice(0, 10))}` : ""}` } : { state: "paused" as const, label: "Paused", detail: "no new reports until resumed" };
      return { id: a.id, type: "weekly", href: "/weekly", name: a.name, kind: "Weekly Competitor Pulse · emailed as PDF and PowerPoint", brands: names(c?.watchlist ?? []), repeats: "Weekly", state: st.state, status: st.label, detail: st.detail, ends_on: null, latest: mine.length ? mine[mine.length - 1].label : null, versions: mine.length, updated: day(a.last_run_at ?? a.created_at), error: null };
    }),
    ...decks.map((d): DeckItem => {
      const st = deckStatus({ recurring: d.recurring, grain: d.spec.grain, ends_on: d.ends_on, paused_at: d.paused_at, next_run_at: d.next_run_at });
      return {
        id: d.id,
        type: "deck",
        href: `/decks/${d.id}`,
        name: d.name,
        kind: deckTemplate(d.template)?.name ?? (d.source === "chat" ? "From Chats" : d.source === "pulse" ? "From a Pulse board" : d.template?.startsWith("co-") ? "Your team's template" : "Deck"),
        brands: d.spec.rep ? brandName.get(d.spec.rep.focus) ?? d.spec.rep.focus : d.spec.social ? brandName.get(d.spec.social.focus) ?? d.spec.social.focus : names(d.spec.watchlist),
        repeats: d.recurring ? every(d.spec.grain) : "–",
        state: st.state,
        status: st.label,
        detail: st.detail,
        ends_on: d.ends_on,
        latest: d.latest?.label ?? null,
        versions: d.versions,
        updated: day(d.updated_at),
        error: d.last_error,
      };
    }),
  ];
  // what is still running first, then what is paused, then the one-offs, then what has ended
  const ORDER = { monitoring: 0, paused: 1, "one-off": 2, ended: 3 } as const;
  items.sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-6 md:px-6">
      <PageHeader
        title="Decks"
        subtitle="Slide decks from a template, from scratch or from Chats: actual slides, Ask AI on each, PDF and PowerPoint, and a new version every day, week or month until a day you choose."
        actions={<>
          <Link className={buttonClass("outline", "sm")} href="/reports" title="Reports made from Chats, and the schedules behind them">Reports</Link>
          <Link className={buttonClass("primary", "sm")} href="/decks/new"><IconPlus size={16} />New deck</Link>
        </>}
      />
      {items.length > 0 ? (
        <DeckList decks={items} today={today} />
      ) : (
        <p className={EMPTY}>No decks yet. <Link className={LINK} href="/decks/new">Start one from a template</Link>{pr ? ": the Weekly Reputation Report is the one to send up every week." : role.id === "social" ? ": the Monthly Content Review is the one to send up every month." : ", or ask CeMO something in Chats and turn the conversation into a deck."}</p>
      )}
      {boards.length > 0 && (
        <section className="rounded-3xl border border-card-border bg-white p-5 md:p-6">
          <h2 className="text-lg font-semibold leading-tight text-gray-900">Pulse boards</h2>
          <p className="text-xs text-gray-500">Boards made before Decks. They still open and refresh; new work goes into decks.</p>
          <ul className="mt-3 flex flex-col divide-y divide-card-border">
            {boards.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <Link className={`${LINK} text-sm`} href={`/pulse/${p.id}`}>{p.name}</Link>
                <small className="text-xs text-gray-500">{p.cards} cards · updated {day(p.updated_at)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
