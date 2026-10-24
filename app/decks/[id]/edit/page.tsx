/** Edit a deck: its name, brands, client, grain, platforms and slides; saving can make a new version. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/ui/kit/Button";
import { PageHeader } from "@/ui/kit/PageHeader";
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { deckOptions } from "@/decks/page";
import { getDeck } from "@/decks/store";
import { DeckForm } from "@/ui/decks/DeckForm";
import { currentBrand } from "@/brand/current";
import { fairBadge } from "@/brand/demo";

export const dynamic = "force-dynamic";

export default async function EditDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await params;
  const deck = await getDeck(id, ws);
  if (!deck) notFound();
  const options = await deckOptions(ws, await currentRole(ws), (await currentActor())?.email ?? null, fairBadge(await currentBrand()));
  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 md:px-6">
      <PageHeader
        title={`Edit ${deck.name}`}
        subtitle="Changes apply to the next version; the versions already made stay as they were."
        actions={<Link className={buttonClass("outline", "sm")} href={`/decks/${deck.id}`}>Back to the deck</Link>}
      />
      <DeckForm options={options} initial={{ id: deck.id, name: deck.name, spec: deck.spec, recurring: deck.recurring, template: deck.template, ends_on: deck.ends_on }} />
    </section>
  );
}
