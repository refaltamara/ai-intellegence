import { describe, expect, it } from "vitest";
import { historyTurns, userTurn } from "../loop";

describe("historyTurns", () => {
  it("replays a clarifying question as tool_use and the answer as its tool_result", () => {
    const h = [
      { role: "user" as const, content_json: { text: "find creators for Ramadan" } },
      { role: "assistant" as const, content_json: { text: "", ask: { tool_use_id: "toolu_1", question: "Exclude competitor creators?", options: [{ label: "Yes", value: "exclude" }, { label: "No", value: "include" }], why: "overlap changes ranking" } } },
      { role: "user" as const, content_json: { text: "exclude" } },
      { role: "assistant" as const, content_json: { text: "41 fit <ev id=\"ev_01\"></ev>." } },
    ];
    const { messages, pendingAsk } = historyTurns(h);
    expect(pendingAsk).toBeNull();
    expect(messages[1].role).toBe("assistant");
    const blocks = messages[1].content as any[];
    expect(blocks[0]).toMatchObject({ type: "tool_use", id: "toolu_1", name: "ask_user" });
    const answer = messages[2].content as any[];
    expect(answer[0]).toEqual({ type: "tool_result", tool_use_id: "toolu_1", content: "exclude" });
    expect(answer[1]).toEqual({ type: "text", text: "exclude" });
    expect(messages[3].content).toBe("41 fit [ev_01].");
  });

  it("reports a pending question when the thread ends on one", () => {
    const { pendingAsk } = historyTurns([
      { role: "user", content_json: { text: "hi" } },
      { role: "assistant", content_json: { text: "", ask: { tool_use_id: "toolu_9", question: "q", options: [], why: "" } } },
    ]);
    expect(pendingAsk).toBe("toolu_9");
  });
});

describe("userTurn", () => {
  it("puts the answer to a pending question first, as a tool_result", () => {
    const t = userTurn("exclude them", [], "toolu_9");
    const c = t.content as any[];
    expect(c[0]).toEqual({ type: "tool_result", tool_use_id: "toolu_9", content: "exclude them" });
    expect(c[c.length - 1]).toEqual({ type: "text", text: "exclude them" });
  });
  it("keeps documents between the tool_result and the text", () => {
    const c = userTurn("q", [{ filename: "b.pdf", data: "QQ==" }], "toolu_1").content as any[];
    expect(c.map((b) => b.type)).toEqual(["tool_result", "document", "text"]);
  });
});

describe("historyTurns with notes", () => {
  it("folds a hidden note into the next user message and reports a trailing one", () => {
    const { messages, pendingNotes } = historyTurns([
      { role: "user", content_json: { text: "find creators" } },
      { role: "assistant", content_json: { text: "41 fit." } },
      { role: "user", content_json: { text: "You exported 41 rows as CSV", note: "export" } },
      { role: "user", content_json: { text: "now nano only" } },
      { role: "assistant", content_json: { text: "12 fit." } },
      { role: "user", content_json: { text: "You exported 12 rows as Excel", note: "export" } },
    ]);
    expect(messages).toHaveLength(4);
    expect(messages[2].content).toBe("(Earlier: You exported 41 rows as CSV.)\nnow nano only");
    expect(pendingNotes).toEqual(["You exported 12 rows as Excel"]);
  });
});
