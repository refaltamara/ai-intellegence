import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isPublicPath } from "../../auth/session";
import { limitHit } from "../store";
import { metadata, originOf, pkceOk, validRedirectUri } from "../oauth";
import { handle, type Deps } from "../server";

describe("OAuth pieces", () => {
  it("verifies PKCE S256 and nothing weaker", () => {
    const verifier = "a".repeat(43) + "-._~xyz";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(pkceOk(verifier, challenge)).toBe(true);
    expect(pkceOk(verifier + "x", challenge)).toBe(false);
    expect(pkceOk("short", createHash("sha256").update("short").digest("base64url"))).toBe(false);
    expect(pkceOk(undefined, challenge)).toBe(false);
  });

  it("accepts https and loopback http redirects only", () => {
    expect(validRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(validRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(validRedirectUri("http://127.0.0.1:33418/cb")).toBe(true);
    expect(validRedirectUri("http://evil.example/cb")).toBe(false);
    expect(validRedirectUri("javascript:alert(1)")).toBe(false);
    expect(validRedirectUri("https://x.example/cb#frag")).toBe(false);
    expect(validRedirectUri(42)).toBe(false);
  });

  it("names the host the client used", () => {
    expect(originOf(new Headers({ host: "localhost:3007" }))).toBe("http://localhost:3007");
    expect(originOf(new Headers({ host: "internal", "x-forwarded-host": "fair.example", "x-forwarded-proto": "https" }))).toBe("https://fair.example");
    const m = metadata("https://fair.example");
    expect(m.resource.resource).toBe("https://fair.example/api/mcp");
    expect(m.server.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("opens the connector's OAuth paths without a cookie, but not consent or the connection list", () => {
    for (const p of ["/api/mcp", "/api/oauth/token", "/api/oauth/register", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"]) expect(isPublicPath(p), p).toBe(true);
    for (const p of ["/oauth/authorize", "/api/oauth/authorize", "/api/mcp/connections", "/connect"]) expect(isPublicPath(p), p).toBe(false);
  });

  it("stops at the first limit reached", () => {
    expect(limitHit({ user_minute: 0, user_day: 0, workspace_day: 0 })).toBeNull();
    expect(limitHit({ user_minute: 20, user_day: 1, workspace_day: 1 })).toMatch(/a minute/);
    expect(limitHit({ user_minute: 0, user_day: 300, workspace_day: 1 })).toMatch(/a day per person/);
    expect(limitHit({ user_minute: 0, user_day: 0, workspace_day: 2000 })).toMatch(/for this workspace/);
  });
});

describe("the MCP handler", () => {
  const deps = (over: Partial<Deps> = {}): Deps => ({
    workspaceLabel: "Maudy Ayunda (PR team)",
    listTools: async () => [{ name: "sentiment", description: "x", inputSchema: { type: "object" } }],
    callTool: async () => ({ status: "ok", payload: { rows: [{ a: 1 }] } }),
    checkLimit: async () => null,
    log: vi.fn(async () => undefined),
    ...over,
  });

  it("negotiates the protocol version and says what it is", async () => {
    const r = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, deps());
    expect(r?.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fair-intelligence" } });
    expect((r?.result as { instructions: string }).instructions).toMatch(/Maudy Ayunda/);
    const old = await handle({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, deps());
    expect((old?.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
  });

  it("answers notifications with nothing and unknown methods with an error", async () => {
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, deps())).toBeNull();
    expect((await handle({ jsonrpc: "2.0", id: 3, method: "sampling/createMessage" }, deps()))?.error?.code).toBe(-32601);
    expect((await handle({ id: 4, method: "ping" } as never, deps()))?.error?.code).toBe(-32600);
  });

  it("lists and calls tools, logging each call", async () => {
    const d = deps();
    const list = await handle({ jsonrpc: "2.0", id: 5, method: "tools/list" }, d);
    expect((list?.result as { tools: unknown[] }).tools).toHaveLength(1);
    const call = await handle({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "sentiment", arguments: { window: { last_n_days: 7 } } } }, d);
    expect(call?.result).toMatchObject({ isError: false, content: [{ type: "text", text: JSON.stringify({ rows: [{ a: 1 }] }) }] });
    expect(d.log).toHaveBeenCalledWith("sentiment", { window: { last_n_days: 7 } }, "ok", expect.any(Number), null);
  });

  it("refuses over the limit without running, and reports failures as tool errors", async () => {
    const callTool = vi.fn();
    const limited = await handle({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "sentiment" } }, deps({ checkLimit: async () => "Limit reached", callTool }));
    expect(callTool).not.toHaveBeenCalled();
    expect(limited?.result).toMatchObject({ isError: true, content: [{ text: "Limit reached" }] });
    const broken = await handle({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "sentiment" } }, deps({ callTool: async () => { throw new Error("boom"); } }));
    expect(broken?.result).toMatchObject({ isError: true });
  });
});
