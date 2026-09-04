import { describe, expect, it } from "vitest";
import { userTurn } from "../loop";
import { attachmentError, MAX_ATTACHMENT_BYTES } from "../attachments";

describe("userTurn", () => {
  it("sends plain text when nothing is attached", () => {
    expect(userTurn("hi", [])).toEqual({ role: "user", content: "hi" });
  });

  it("puts documents before the text, as the Messages API expects", () => {
    const t = userTurn("what is this brief asking for?", [{ filename: "brief.pdf", data: "QUJD" }]);
    const content = t.content as any[];
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe("document");
    expect(content[0].source).toMatchObject({ type: "base64", media_type: "application/pdf", data: "QUJD" });
    expect(content[0].title).toBe("brief.pdf");
    expect(content[1]).toEqual({ type: "text", text: "what is this brief asking for?" });
  });

  it("puts the cache breakpoint on the last document only", () => {
    const content = userTurn("q", [
      { filename: "a.pdf", data: "QQ==" },
      { filename: "b.pdf", data: "Qg==" },
      { filename: "c.pdf", data: "Qw==" },
    ]).content as any[];
    expect(content.filter((b) => b.cache_control)).toHaveLength(1);
    expect(content[2].cache_control).toEqual({ type: "ephemeral" });
    expect(content[0].cache_control).toBeUndefined();
  });
});

describe("attachmentError", () => {
  it("accepts a normal PDF", () => {
    expect(attachmentError({ name: "brief.pdf", type: "application/pdf", size: 900_000 })).toBeNull();
  });

  it("rejects other types, oversized files and empty files", () => {
    expect(attachmentError({ name: "deck.pptx", type: "application/vnd.ms-powerpoint", size: 10 })).toMatch(/only PDF/);
    expect(attachmentError({ name: "big.pdf", type: "application/pdf", size: MAX_ATTACHMENT_BYTES + 1 })).toMatch(/the limit is/);
    expect(attachmentError({ name: "empty.pdf", type: "application/pdf", size: 0 })).toMatch(/empty/);
  });
});
