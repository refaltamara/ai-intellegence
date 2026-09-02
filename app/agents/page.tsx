import { Agents } from "@/ui/Agents";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { listAgents, listRuns } from "@/agents/store";
import { hasModelCredentials } from "@/chat/loop";
import { impls } from "@/skills/index";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await listAgents(DEFAULT_WORKSPACE_ID);
  const withRuns = await Promise.all(agents.map(async (a) => ({ ...a, runs: await listRuns(a.id, 8) })));
  return <Agents agents={withRuns} skills={Object.keys(impls)} modelConfigured={hasModelCredentials()} emailConfigured={!!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)} />;
}
