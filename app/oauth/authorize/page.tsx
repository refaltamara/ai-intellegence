import { redirect } from "next/navigation";
import { currentActor, currentSession, currentWorkspaceId } from "@/auth/current";
import { checkAuthRequest, withParams } from "@/mcp/authorize";
import { teamsFor, workspacesOf } from "@/workspace/teams";
import { TeamIcon } from "@/ui/TeamIcon";

export const dynamic = "force-dynamic";

/** Consent: a person signed in to Fair Intelligence lets Claude, ChatGPT or another app read one team's data. */
export default async function Authorize({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const session = await currentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(p as Record<string, string>)}`)}`);
  const checked = await checkAuthRequest(p);
  if ("redirectError" in checked) {
    const e = checked.redirectError;
    redirect(withParams(e.uri, { error: e.error, error_description: e.description, state: e.state }));
  }
  if ("fatal" in checked) {
    return (
      <div className="login consent"><div className="box"><form className="card"><h2>Can&apos;t connect</h2><p className="d">{checked.fatal}</p></form></div></div>
    );
  }
  const { client } = checked.ok;
  const [all, ws] = await Promise.all([currentActor().then(teamsFor), currentWorkspaceId()]);
  const teams = workspacesOf(all);
  const current = teams.find((t) => t.workspace_id === ws)?.workspace_id ?? teams[0]?.workspace_id;
  const app = client.client_name || "An app";
  return (
    <div className="login consent">
      <div className="box">
        <div className="brand"><div className="mark">F</div><div><b>Fair Intelligence</b><small>Connect an AI assistant</small></div></div>
        <form className="card" method="post" action="/api/oauth/authorize">
          <h2>{app} wants to read your Fair Intelligence data</h2>
          <p className="d">It will be able to run the same analyses you use in the app and read their results, as <b>{session.email}</b>. It cannot change anything. Each question it asks counts toward your daily limit, and you can disconnect it any time from <b>Connect Claude / ChatGPT</b> in the sidebar.</p>
          {teams.length > 1 && <p className="lbl">Which workspace&apos;s data?</p>}
          <div className="pick">
            {teams.map((t) => (
              <label key={t.workspace_id} className="opt" data-tone={t.tone}>
                <input type="radio" name="workspace_id" value={t.workspace_id} defaultChecked={t.workspace_id === current} />
                <span className="ic"><TeamIcon kind={t.role} size={16} /></span>
                <span><b>{t.name}</b><small>{all.filter((x) => x.workspace_id === t.workspace_id).map((x) => x.label).join(" · ")}</small></span>
              </label>
            ))}
          </div>
          {Object.entries({ client_id: p.client_id, redirect_uri: checked.ok.redirectUri, code_challenge: p.code_challenge, state: p.state, scope: p.scope }).map(([k, v]) => v != null && <input key={k} type="hidden" name={k} value={v} />)}
          <div className="acts">
            <button className="btn" type="submit" name="decision" value="deny">Cancel</button>
            <button className="btn pri" type="submit" name="decision" value="allow">Allow</button>
          </div>
        </form>
      </div>
    </div>
  );
}
