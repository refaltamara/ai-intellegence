/** Edit a deck: its name, brands, client, grain, platforms and slides; saving can make a new version. */
import { notFound } from "next/navigation";
import { currentRole, currentWorkspaceId } from "@/auth/current";
import { deckOptions } from "@/decks/page";
import { getDeck } from "@/decks/store";
import { DeckForm } from "@/ui/decks/DeckForm";

export const dynamic = "force-dynamic";

export default async function EditDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await params;
  const deck = await getDeck(id, ws);
  if (!deck) notFound();
  const options = await deckOptions(ws, await currentRole(ws));
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Edit {deck.name}</h1><span className="meta">Changes apply to the next version; the versions already made stay as they were.</span></div></div>
      <div className="wrap wide"><DeckForm options={options} initial={{ id: deck.id, name: deck.name, spec: deck.spec, recurring: deck.recurring, template: deck.template }} /></div>
    </section>
  );
}
