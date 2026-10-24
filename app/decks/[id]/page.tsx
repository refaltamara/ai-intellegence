/** One deck, version by version: the actual slides with Ask AI on each. ?v=<version>&s=<slide> */
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentWorkspaceId } from "@/auth/current";
import { dataSpan, deckPeriods } from "@/decks/generate";
import { deckVersions, getDeck } from "@/decks/store";
import { DeckFirst } from "@/ui/decks/DeckFirst";
import { DeckViewer } from "@/ui/decks/DeckViewer";
import { PageHeader } from "@/ui/kit/PageHeader";

export const dynamic = "force-dynamic";

export default async function DeckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; s?: string }> }) {
  const ws = await currentWorkspaceId();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const deck = await getDeck(id, ws);
  if (!deck) notFound();
  const [versions, periods] = await Promise.all([deckVersions(deck.id, ws), deckPeriods(ws, deck.spec.grain, deck.spec.grain === "month" ? 6 : deck.spec.grain === "day" ? 14 : 12, { runs: !deck.spec.rep && !deck.spec.social })]);
  // PR decks may cover days picked by hand (a case moves faster than a week)
  const range = deck.spec.rep ? await dataSpan(ws) : null;
  if (!versions.length) {
    return (
      <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-6 md:px-6">
        <PageHeader title={deck.name} subtitle={<><Link className="font-semibold text-brand-palette-700 underline-offset-2 hover:underline" href="/decks">Decks</Link> · no version yet</>} />
        <DeckFirst deckId={deck.id} error={deck.last_error} periods={periods} range={range} day={deck.spec.grain === "day"} />
      </section>
    );
  }
  const selected = versions.find((v) => v.id === sp.v) ?? versions[versions.length - 1];
  const slide = Math.max(1, Math.min(selected.slides.length, Number(sp.s) || 1));
  return (
    <DeckViewer
      deck={{ id: deck.id, name: deck.name, grain: deck.spec.grain, recurring: deck.recurring, last_error: deck.last_error, source: deck.source, next_run_at: deck.next_run_at }}
      items={versions}
      initialId={selected.id}
      initialSlide={slide}
      periods={periods}
      range={range}
      day={deck.spec.grain === "day"}
    />
  );
}
