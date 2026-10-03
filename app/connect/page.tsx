import { headers } from "next/headers";
import { currentSession } from "@/auth/current";
import { MCP_LIMITS } from "@/config/mcp";
import { originOf } from "@/mcp/oauth";
import { listConnections, usage } from "@/mcp/store";
import { teamsFor } from "@/workspace/teams";
import { Connections, CopyButton } from "@/ui/Connections";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const session = (await currentSession())!;
  const origin = originOf(await headers());
  const url = `${origin}/api/mcp`;
  const [connections, teams, used] = await Promise.all([listConnections(session.uid), teamsFor(session), usage(session.uid, session.ws)]);
  const teamName = Object.fromEntries(teams.map((t) => [t.workspace_id, t.name]));
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Connect Claude or ChatGPT</h1><span className="meta">Use Fair Intelligence from your own AI assistant</span></div><span className="pill">{used.user_day} of {MCP_LIMITS.per_user_per_day} analyses used today</span></div>
      <div className="wrap">
        <div className="connectcard">
          <p className="lbl">Your connector address</p>
          <div className="urlrow"><code>{url}</code><CopyButton text={url} /></div>
          <p className="d">Add it once in your assistant, sign in with your Fair Intelligence account, and pick the team whose data it may read. The assistant then runs the same analyses as this app, on your team&apos;s data only, and every number it quotes comes with the posts behind it. It can read, never change.</p>
        </div>
        <div className="howto">
          <div className="step" data-tone="coral"><b>Claude</b><ol><li>Settings → Connectors → <i>Add custom connector</i></li><li>Name it “Fair Intelligence” and paste the address above</li><li>Click Connect, sign in, choose your team, Allow</li></ol><small>Claude.ai, Claude Desktop and the Claude mobile apps share the connector once it is added on the web.</small></div>
          <div className="step" data-tone="mint"><b>ChatGPT</b><ol><li>Settings → Apps &amp; Connectors → turn on developer mode (Advanced)</li><li>Create a connector, paste the address above, OAuth</li><li>Sign in, choose your team, Allow</li></ol><small>Custom connectors depend on your ChatGPT plan and workspace settings.</small></div>
        </div>
        <h3 className="subh">Connected apps</h3>
        <Connections rows={connections.map((c) => ({ ...c, team: teamName[c.workspace_id] ?? c.workspace_id }))} />
        <h3 className="subh">Limits</h3>
        <ul className="limits">
          <li><b>{MCP_LIMITS.per_user_per_minute}</b> analyses a minute per person, so an assistant stuck in a loop stops quickly</li>
          <li><b>{MCP_LIMITS.per_user_per_day}</b> analyses a day per person</li>
          <li><b>{MCP_LIMITS.per_workspace_per_day.toLocaleString("en-US")}</b> analyses a day for everyone on a team&apos;s data together</li>
          <li>Up to <b>{MCP_LIMITS.max_rows}</b> rows per answer; open the same question here to see and export everything</li>
        </ul>
      </div>
    </section>
  );
}
