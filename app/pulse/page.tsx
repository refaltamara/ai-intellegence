/** Pulse: the crisis dashboard of a profile workspace. Category workspaces have no Pulse; they go to Data. */
import { redirect } from "next/navigation";
import { pulsePage } from "@/pulse/page";
import { PulsePage } from "@/ui/PulsePage";
import { currentWorkspaceId } from "@/auth/current";

export const dynamic = "force-dynamic";
// Pulse runs four analyses plus a dozen queries; well under this now, but a slow
// database should show a late page rather than a platform timeout.
export const maxDuration = 60;

export default async function Pulse() {
  const ws = await currentWorkspaceId();
  const d = await pulsePage(ws);
  if (!d) redirect("/data");
  return <PulsePage d={d} />;
}
