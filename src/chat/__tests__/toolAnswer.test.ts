import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { toolAnswer } from "../client";

const msg = (content: unknown[], stop_reason = "end_turn") => ({ content, stop_reason }) as unknown as Anthropic.Message;
const req = { model: "m", max_tokens: 100, tools: [], messages: [{ role: "user" as const, content: "label these" }] };

describe("a tool's answer without forcing the tool", () => {
  it("asks on auto and names the tool in the last user message", async () => {
    const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const { use } = await toolAnswer(async (r) => { seen.push(r); return msg([{ type: "tool_use", id: "t1", name: "read", input: { posts: [] } }], "tool_use"); }, req, "read");
    expect(use?.name).toBe("read");
    expect(seen).toHaveLength(1);
    expect(seen[0].tool_choice).toEqual({ type: "auto" });
    expect(seen[0].messages[0].content).toBe("label these\n\nAnswer by calling the read tool.");
  });
  it("nudges once when the reply skipped the tool, keeping the history append-only", async () => {
    const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const replies = [msg([{ type: "text", text: "Sure." }]), msg([{ type: "tool_use", id: "t2", name: "read", input: {} }], "tool_use")];
    const { use, messages } = await toolAnswer(async (r) => { seen.push(r); return replies[seen.length - 1]; }, req, "read");
    expect(use?.id).toBe("t2");
    expect(seen).toHaveLength(2);
    expect(seen[1].messages.slice(0, 1)).toEqual(seen[0].messages);
    expect(messages).toHaveLength(3);
  });
  it("does not nudge after a refusal", async () => {
    let calls = 0;
    const { use } = await toolAnswer(async () => { calls++; return msg([], "refusal"); }, req, "read");
    expect(use).toBeUndefined();
    expect(calls).toBe(1);
  });
});
