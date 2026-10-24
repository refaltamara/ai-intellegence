import { headers } from "next/headers";
import { currentActor, currentSession } from "@/auth/current";
import { MCP_LIMITS } from "@/config/mcp";
import { originOf } from "@/mcp/oauth";
import { listConnections, usage } from "@/mcp/store";
import { teamsFor } from "@/workspace/teams";
import { Connections, CopyButton } from "@/ui/Connections";
import { TWO } from "@/ui/dashboard/parts";
import { PageHeader } from "@/ui/kit/PageHeader";
import { Panel, SectionCard } from "@/ui/kit/Section";
import { StatusPill } from "@/ui/kit/StatusPill";

export const dynamic = "force-dynamic";

// no preflight: the list keeps the browser's margins unless they are set here
const STEPS = "m-0 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700 marker:font-semibold marker:text-gray-500";

export default async function ConnectPage() {
  const session = (await currentSession())!;
  const origin = originOf(await headers());
  const url = `${origin}/api/mcp`;
  const [connections, teams, used] = await Promise.all([listConnections(session.uid), currentActor().then(teamsFor), usage(session.uid, session.ws)]);
  const teamName = Object.fromEntries(teams.map((t) => [t.workspace_id, t.name]));
  const limits = [
    { n: MCP_LIMITS.per_user_per_minute.toLocaleString("en-US"), text: "analyses a minute per person, so an assistant stuck in a loop stops quickly" },
    { n: MCP_LIMITS.per_user_per_day.toLocaleString("en-US"), text: "analyses a day per person" },
    { n: MCP_LIMITS.per_workspace_per_day.toLocaleString("en-US"), text: "analyses a day for everyone on a team's data together" },
    { n: `Up to ${MCP_LIMITS.max_rows.toLocaleString("en-US")}`, text: "rows per answer; open the same question here to see and export everything" },
  ];
  return (
    <section data-tw className="flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6">
      <PageHeader title="Connect Claude or ChatGPT" subtitle="Use Fair Intelligence from your own AI assistant"
        actions={<StatusPill tone="neutral">{used.user_day} of {MCP_LIMITS.per_user_per_day} analyses used today</StatusPill>} />

      <SectionCard title="Your connector address" hint="Add it once in your assistant.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all rounded-2xl bg-gray-50 px-4 py-3 font-mono text-sm text-gray-900">{url}</code>
          <CopyButton text={url} label="Copy address" />
        </div>
        <p className="text-sm leading-relaxed text-gray-600">Add it once in your assistant, sign in with your Fair Intelligence account, and pick the team whose data it may read. The assistant then runs the same analyses as this app, on your team&apos;s data only, and every number it quotes comes with the posts behind it. It can read, never change.</p>
      </SectionCard>

      <div className={TWO}>
        <Panel title="Claude" className="bg-white">
          <ol className={STEPS}>
            <li>Settings → Connectors → <i>Add custom connector</i></li>
            <li>Name it “Fair Intelligence” and paste the address above</li>
            <li>Click Connect, sign in, choose your team, Allow</li>
          </ol>
          <p className="text-xs leading-relaxed text-gray-500">Claude.ai, Claude Desktop and the Claude mobile apps share the connector once it is added on the web.</p>
        </Panel>
        <Panel title="ChatGPT" className="bg-white">
          <ol className={STEPS}>
            <li>Settings → Apps &amp; Connectors → turn on developer mode (Advanced)</li>
            <li>Create a connector, paste the address above, OAuth</li>
            <li>Sign in, choose your team, Allow</li>
          </ol>
          <p className="text-xs leading-relaxed text-gray-500">Custom connectors depend on your ChatGPT plan and workspace settings.</p>
        </Panel>
      </div>

      <SectionCard title="Connected apps" hint="Assistants signed in with your account. Disconnect one to stop it reading your team's data.">
        <Connections rows={connections.map((c) => ({ ...c, team: teamName[c.workspace_id] ?? c.workspace_id }))} />
      </SectionCard>

      <SectionCard title="Limits" hint="The same for every assistant you connect.">
        <ul className="flex list-none flex-col divide-y divide-card-border">
          {limits.map((l) => (
            <li key={l.text} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-3">
              <b className="shrink-0 font-semibold tabular-nums text-gray-900 sm:w-32">{l.n}</b>
              <span className="text-sm text-gray-600">{l.text}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </section>
  );
}
