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

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** Effort for chat turns (ANTHROPIC_EFFORT_CHAT, default medium): the main latency lever with adaptive thinking on. */
export function chatEffort(): Effort {
  const e = (process.env.ANTHROPIC_EFFORT_CHAT ?? "medium").trim().toLowerCase() as Effort;
  return EFFORTS.includes(e) ? e : "medium";
}

/**
 * One tool's answer without forcing the tool: Claude Sonnet 5.5 rejects a forced
 * tool_choice ("tool"/"any"), so the request runs on auto, the last user message
 * says which tool to answer with, and a reply that skipped it gets one nudge.
 * Returns the messages the answer was given against, so a caller that goes on
 * (a retry after a rejected answer) keeps the history append-only.
 */
export async function toolAnswer(
  call: (req: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>,
  req: Anthropic.MessageCreateParamsNonStreaming,
  tool: string,
): Promise<{ res: Anthropic.Message; use: Anthropic.ToolUseBlock | undefined; messages: Anthropic.MessageParam[] }> {
  const last = req.messages.length - 1;
  let messages = req.messages.map((m, i) => (i === last && m.role === "user" && typeof m.content === "string" ? { ...m, content: `${m.content}\n\nAnswer by calling the ${tool} tool.` } : m));
  const find = (r: Anthropic.Message) => r.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === tool);
  let res = await call({ ...req, tool_choice: { type: "auto" }, messages });
  let use = find(res);
  if (!use && res.stop_reason === "end_turn") {
    messages = [...messages, { role: "assistant", content: res.content }, { role: "user", content: `Answer now by calling the ${tool} tool.` }];
    res = await call({ ...req, tool_choice: { type: "auto" }, messages });
    use = find(res);
  }
  return { res, use, messages };
}
