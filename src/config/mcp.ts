/**
 * Guardrails for the connector (Claude, ChatGPT and other MCP clients). Every tool
 * call counts; listing tools and the handshake do not. Limits are per person and
 * per workspace (one client's whole team), and every call is logged in mcp_calls.
 */
export const MCP_LIMITS = {
  /** a burst guard: a model looping on one question stops here */
  per_user_per_minute: 20,
  /** a heavy analyst day is ~100; this leaves room without being unlimited */
  per_user_per_day: 300,
  /** all of one client's people together */
  per_workspace_per_day: 2000,
  /** rows returned per call; the full table stays in the app, where it can be exported */
  max_rows: 50,
  max_evidence: 60,
  /** characters in one tool result, so a single call cannot flood the client's context */
  max_result_chars: 60_000,
} as const;

export const MCP_TOKENS = {
  access_minutes: 60,
  refresh_days: 30,
  code_minutes: 5,
} as const;
