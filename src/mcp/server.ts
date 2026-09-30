/**
 * The MCP endpoint's protocol layer: stateless JSON-RPC over Streamable HTTP
 * (plain JSON responses, no session, no server-initiated stream). Tools only.
 * Dependencies are passed in so the protocol can be tested without a database.
 */
import type { McpTool, ToolOutcome } from "./tools";

export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST = "2025-06-18";

export type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

export type Deps = {
  workspaceLabel: string;
  listTools: () => Promise<McpTool[]>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;
  /** returns a message when a limit stops the call */
  checkLimit: () => Promise<string | null>;
  log: (tool: string, args: Record<string, unknown>, status: string, ms: number, error?: string | null) => Promise<void>;
};

export function instructions(label: string): string {
  return `Fair Intelligence: social listening data for ${label}. Call workspace_overview first to see what is loaded. Every number comes from these tools, computed in the database: quote numbers exactly as returned, cite the evidence (post links) behind them, and do not compute new figures from them. When a tool returns status "unavailable", say which data is not loaded rather than estimating.`;
}

const ok = (id: RpcRequest["id"], result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One message in, one response out; notifications (no id) return null. */
export async function handle(msg: RpcRequest, deps: Deps): Promise<RpcResponse | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;
  const params = (msg.params ?? {}) as Record<string, unknown>;
  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : LATEST;
      return ok(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "fair-intelligence", title: "Fair Intelligence", version: "1.0.0" },
        instructions: instructions(deps.workspaceLabel),
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: await deps.listTools() });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
      if (!name) return fail(msg.id, -32602, "tools/call needs a tool name");
      const limited = await deps.checkLimit();
      if (limited) {
        await deps.log(name, args, "limited", 0, limited);
        return ok(msg.id, { content: [{ type: "text", text: limited }], isError: true });
      }
      const started = Date.now();
      try {
        const out = await deps.callTool(name, args);
        await deps.log(name, args, out.status, Date.now() - started, out.error ?? null);
        return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(out.payload) }], isError: out.status === "error" });
      } catch (e) {
        const message = (e as Error).message;
        await deps.log(name, args, "error", Date.now() - started, message);
        return ok(msg.id, { content: [{ type: "text", text: `The analysis failed: ${message}` }], isError: true });
      }
    }
    case "resources/list":
      return ok(msg.id, { resources: [] });
    case "prompts/list":
      return ok(msg.id, { prompts: [] });
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
