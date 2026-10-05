import { redirect } from "next/navigation";
import { currentActor, currentSession } from "@/auth/current";
import { safeNext, teamsFor } from "@/workspace/teams";
import { TeamPicker } from "@/ui/TeamPicker";

export const dynamic = "force-dynamic";

/** Asked at every sign-in: which team are you working as today? Skipped when there is only one to choose. */
export default async function PersonaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const next = safeNext((await searchParams).next);
  // connecting Claude or ChatGPT picks its team on the consent screen instead
  if (next?.startsWith("/oauth/")) redirect(next);
  const teams = await teamsFor(await currentActor());
  if (teams.length <= 1) redirect(next ?? teams[0]?.home ?? "/");
  return <TeamPicker teams={teams} email={session.email} next={next} />;
}
