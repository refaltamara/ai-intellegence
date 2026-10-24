/** A new deck: a template, the brands, the client (optional), week or month, the slides, and the first version. */
import { redirect } from "next/navigation";
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { deckOptions } from "@/decks/page";
import { deckWorkspace } from "@/pulses/api";
import { DeckForm } from "@/ui/decks/DeckForm";
import { currentBrand } from "@/brand/current";
import { fairBadge } from "@/brand/demo";
import { PageHeader } from "@/ui/kit/PageHeader";

export const dynamic = "force-dynamic";

export default async function NewDeckPage({ searchParams }: { searchParams: Promise<{ slide?: string; brands?: string; grain?: string }> }) {
  const ws = await currentWorkspaceId();
  if (!(await deckWorkspace(ws))) redirect("/pulse");
  const [options, sp] = await Promise.all([deckOptions(ws, await currentRole(ws), (await currentActor())?.email ?? null, fairBadge(await currentBrand())), searchParams]);
  // from "Add to a deck → New deck" on the Dashboard: that section's slide, brands and grain
  const prefill = sp.slide && options.slides.some((s) => s.kind === sp.slide)
    ? { slide: sp.slide, brands: (sp.brands ?? "").split(",").filter(Boolean).slice(0, 12), grain: sp.grain === "month" ? ("month" as const) : sp.grain === "week" ? ("week" as const) : null }
    : null;
  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 md:px-6">
      <PageHeader title="New deck" subtitle="Pick a starting point; every slide can be added or taken out. The first version is made when you create it." />
      <DeckForm options={options} prefill={prefill} />
    </section>
  );
}
