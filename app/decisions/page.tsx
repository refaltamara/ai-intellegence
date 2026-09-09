import { Decisions } from "@/ui/Decisions";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { listDecisions } from "@/decisions/store";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  return <Decisions decisions={await listDecisions(DEFAULT_WORKSPACE_ID)} />;
}
