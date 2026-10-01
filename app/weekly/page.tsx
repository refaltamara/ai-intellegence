import Link from "next/link";
import { currentWorkspaceId } from "@/auth/current";
import { weeklyItems } from "@/reports/weekly";
import { WeeklyViewer } from "@/ui/weekly/WeeklyViewer";

export const dynamic = "force-dynamic";

/** Weekly Reports: the client's weekly decks, slide by slide, with Ask AI beside each slide. ?r=<report>&s=<slide> */
export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ r?: string; s?: string }> }) {
  const ws = await currentWorkspaceId();
  const sp = await searchParams;
  const items = await weeklyItems(ws);
  if (!items.length) {
    return (
      <section className="screen">
        <div className="topbar"><div><h1>Weekly Reports</h1><span className="meta">The weekly competitor decks, slide by slide</span></div></div>
        <div className="wrap"><div className="empty">No weekly report yet. Set up the Weekly Competitor Pulse in <Link href="/reports?new=1">Reports</Link> and press Run now.</div></div>
      </section>
    );
  }
  const selected = items.find((i) => i.id === sp.r) ?? items[items.length - 1];
  const slide = Math.max(1, Math.min(selected.slides.length, Number(sp.s) || 1));
  return <WeeklyViewer items={items} initialId={selected.id} initialSlide={slide} actions={<Link className="btn sm ghost" href="/reports" title="When it runs, who gets it, and every report it made">Schedule</Link>} />;
}
