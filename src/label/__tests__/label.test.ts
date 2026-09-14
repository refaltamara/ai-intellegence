import { describe, expect, it } from "vitest";
import { clip, commentBatchPrompt, commentSystem, parseLabels, stanceBatchPrompt, type CommentForLabel } from "../prompt";

const c = (id: string, text: string, extra: Partial<CommentForLabel> = {}): CommentForLabel => ({
  id, text, platform: "youtube", likes: null, post_url: "https://www.youtube.com/watch?v=abc", post_caption: "Curious People, how are you?", post_source: "owned", post_handle: "modmedia", ...extra,
});

describe("labelling prompts", () => {
  it("groups comments under their post and names the subject", () => {
    const p = commentBatchPrompt("Maudy Ayunda", [c("a", "tone deaf banget"), c("b", "semangat kak", { likes: 12 }), c("x", "setuju", { post_url: "https://x.com/u/status/1", post_source: "earned", post_handle: "u", platform: "x", post_caption: "maudy bacot" })]);
    expect(p).toContain("## Post 1: Maudy Ayunda's own youtube post");
    expect(p).toContain("## Post 2: x post by @u about Maudy Ayunda");
    expect(p).toContain("[b] (12 likes) semangat kak");
    expect(p).toContain("Label all 3 comments");
    expect(commentSystem("Maudy Ayunda")).toContain("negative: criticises");
  });

  it("never cuts an emoji in half and drops stray half surrogates", () => {
    const long = "a".repeat(598) + "🫶🏼🫶🏼🫶🏼";
    const c1 = clip(long, 600);
    expect(JSON.stringify(c1)).not.toMatch(/\\ud83e"|\\ud83e…/i);
    expect(() => JSON.parse(JSON.stringify({ t: c1 }))).not.toThrow();
    expect(Array.from(c1).length).toBe(600);
    expect(clip("x\uD83Ey", 10)).toBe("xy");
  });

  it("clips long captions", () => {
    const p = commentBatchPrompt("S", [c("a", "hi", { post_caption: "x".repeat(2000) })]);
    expect(p.length).toBeLessThan(1200);
    expect(p).toContain("…");
  });

  it("stance prompt lists posts by id", () => {
    const p = stanceBatchPrompt([{ id: "p1", platform: "threads", handle: "abc", caption: "Tone deaf final siss!", url: "u" }]);
    expect(p).toContain("[p1] threads @abc: Tone deaf final siss!");
  });
});

describe("parseLabels", () => {
  it("keeps valid labels for wanted ids, clamps confidence, reports missing", () => {
    const { labels, missing } = parseLabels(
      { labels: [{ id: "a", sentiment: "Negative", confidence: 1.7 }, { id: "b", sentiment: "meh" }, { id: "zzz", sentiment: "positive" }, { id: "a", sentiment: "positive" }, { id: "c", sentiment: "neutral" }] },
      ["a", "b", "c", "d"],
    );
    expect(labels).toEqual([{ id: "a", sentiment: "negative", confidence: 1 }, { id: "c", sentiment: "neutral", confidence: 0.5 }]);
    expect(missing).toEqual(["b", "d"]);
  });

  it("tolerates garbage", () => {
    expect(parseLabels(undefined, ["a"])).toEqual({ labels: [], missing: ["a"] });
    expect(parseLabels({ labels: "no" }, ["a"]).missing).toEqual(["a"]);
  });
});
