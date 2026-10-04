/** A new deck: a template, the brands, the client (optional), week or month, the slides, and the first version. */
import { redirect } from "next/navigation";
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { deckOptions } from "@/decks/page";
import { panelWorkspace } from "@/pulses/api";
import { DeckForm } from "@/ui/decks/DeckForm";

export const dynamic = "force-dynamic";

export default async function NewDeckPage({ searchParams }: { searchParams: Promise<{ slide?: string; brands?: string; grain?: string }> }) {
  const ws = await currentWorkspaceId();
  if (!(await panelWorkspace(ws))) redirect("/pulse");
  const [options, sp] = await Promise.all([deckOptions(ws, await currentRole(ws), (await currentActor())?.email ?? null), searchParams]);
  // from "Add to a deck → New deck" on the Dashboard: that section's slide, brands and grain
  const prefill = sp.slide && options.slides.some((s) => s.kind === sp.slide)
    ? { slide: sp.slide, brands: (sp.brands ?? "").split(",").filter(Boolean).slice(0, 12), grain: sp.grain === "month" ? ("month" as const) : sp.grain === "week" ? ("week" as const) : null }
    : null;
  return (
    <section className="screen">
      <div className="topbar"><div><h1>New deck</h1><span className="meta">Pick a starting point; every slide can be added or taken out. The first version is made when you create it.</span></div></div>
      <div className="wrap wide"><DeckForm options={options} prefill={prefill} /></div>
    </section>
  );
}
