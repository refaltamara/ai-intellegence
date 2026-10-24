import Link from "next/link";
import { currentWorkspaceId } from "@/auth/current";
import { weeklyItems } from "@/reports/weekly";
import { WeeklyViewer } from "@/ui/weekly/WeeklyViewer";
import { buttonClass } from "@/ui/kit/Button";
import { PageHeader } from "@/ui/kit/PageHeader";

export const dynamic = "force-dynamic";

/** Weekly Reports: the client's weekly decks, slide by slide, with Ask AI beside each slide. ?r=<report>&s=<slide> */
export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ r?: string; s?: string }> }) {
  const ws = await currentWorkspaceId();
  const sp = await searchParams;
  const items = await weeklyItems(ws);
  if (!items.length) {
    return (
      <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-6 md:px-6">
        <PageHeader title="Weekly Reports" subtitle="The weekly competitor decks, slide by slide" />
        <p className="rounded-3xl border border-card-border bg-white p-6 text-sm text-gray-700">No weekly report yet. Set up the Weekly Competitor Pulse in <Link className="font-semibold text-brand-palette-700 underline-offset-2 hover:underline" href="/reports?new=1">Reports</Link> and press Run now.</p>
      </section>
    );
  }
  const selected = items.find((i) => i.id === sp.r) ?? items[items.length - 1];
  const slide = Math.max(1, Math.min(selected.slides.length, Number(sp.s) || 1));
  return <WeeklyViewer items={items} initialId={selected.id} initialSlide={slide} actions={<Link className={buttonClass("outline", "sm")} href="/reports" title="When it runs, who gets it, and every report it made">Schedule</Link>} />;
}
