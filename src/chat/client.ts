/**
 * One Anthropic client factory for the app. A multi-workspace ("identity-linked")
 * API key must name the workspace on every request via the anthropic-workspace-id
 * header (docs: manage-claude/authentication#select-a-workspace); a key scoped to
 * one workspace does not need it. Set ANTHROPIC_WORKSPACE_ID (wrkspc_…) to send it.
 */
import Anthropic from "@anthropic-ai/sdk";

export function anthropicClient(): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {});
}

/** Turns API errors into a sentence the UI can show; names the missing setting for the workspace case. */
export function describeModelError(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (/anthropic-workspace-id/i.test(e.message)) {
      return "The Anthropic API key is a multi-workspace key, so the app must name the workspace: set ANTHROPIC_WORKSPACE_ID (the wrkspc_… id from Console → Settings → Workspaces) in the deployment, or use an API key created inside one workspace.";
    }
    if (e.status === 401) return "The Anthropic API key was rejected (401). Check ANTHROPIC_API_KEY.";
    if (e.status === 429) return "The Anthropic API rate limit was hit (429). Try again in a moment.";
    return `Model error ${e.status}: ${e.message}`;
  }
  return (e as Error).message;
}
