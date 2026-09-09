import { describe, expect, it } from "vitest";
import { AnswerStream, splitCounters, usableFollowups } from "../stream";

const known = new Set(["ev_01", "ev_02"]);
function run(chunks: string[]) {
  const s = new AnswerStream(known);
  let out = "";
  for (const c of chunks) out += s.push(c);
  out += s.flush();
  return { out, s };
}

describe("AnswerStream", () => {
  it("rewrites citations and never splits one across chunks", () => {
    const { out } = run(["Wardah leads [ev", "_01] and Skintific ", "[ev_09] trails."]);
    expect(out).toBe('Wardah leads <ev id="ev_01"></ev> and Skintific  trails.');
  });

  it("keeps a counter block intact when the tag is split across chunks", () => {
    const { out, s } = run(["Lead.\n<cou", "nter>Before you commit — micros convert at 47% [ev_02]</cou", "nter>\nAfter."]);
    expect(out).toContain('<counter>Before you commit — micros convert at 47% <ev id="ev_02"></ev></counter>');
    expect(s.hasCounter).toBe(true);
  });

  it("swallows the followups block and parses it", () => {
    const { out, s } = run(["Answer. [ev_01]\n<follow", 'ups>[{"label":"Same list, nano only","prompt":"Show nano only","skill":"discovery","params":{"tiers":["nano"]}},{"label":"Who else?","prompt":"Who else ran this","skill":"campaigns"}]</followups>']);
    expect(out).toBe('Answer. <ev id="ev_01"></ev>\n');
    expect(s.followups).toHaveLength(2);
    expect(s.followups[0]).toEqual({ label: "Same list, nano only", prompt: "Show nano only", skill: "discovery", params: { tiers: ["nano"] } });
  });

  it("drops an unterminated followups block at the end instead of showing it", () => {
    const { out, s } = run(["Answer.\n<followups>[{\"label\":\"x\",\"prompt\":\"y\",\"skill\":\"compare\"}"]);
    expect(out).toBe("Answer.\n");
    expect(s.followups).toEqual([]); // malformed JSON → none, but nothing leaked as text
  });

  it("truncates labels to 48 characters and ignores items without a prompt", () => {
    const long = "L".repeat(80);
    const { s } = run([`<followups>[{"label":"${long}","prompt":"p","skill":"waves"},{"label":"no prompt","skill":"waves"}]</followups>`]);
    expect(s.followups).toHaveLength(1);
    expect(s.followups[0].label).toHaveLength(48);
  });

  it("does not hold back ordinary less-than signs for long", () => {
    const { out } = run(["Views < 1,000 in April; ", "posts fell."]);
    expect(out).toBe("Views < 1,000 in April; posts fell.");
  });
});

describe("usableFollowups", () => {
  it("keeps only analyses the workspace can run, at most three", () => {
    const items = [
      { label: "a", prompt: "a", skill: "discovery" },
      { label: "b", prompt: "b", skill: "objections" },
      { label: "c", prompt: "c", skill: "query_metrics" },
      { label: "d", prompt: "d", skill: "compare" },
      { label: "e", prompt: "e", skill: "waves" },
    ];
    const kept = usableFollowups(items, new Set(["discovery", "compare", "waves"]));
    expect(kept.map((k) => k.skill)).toEqual(["discovery", "query_metrics", "compare"]);
  });
});

describe("splitCounters", () => {
  it("separates prose from counter blocks in order", () => {
    const segs = splitCounters("Lead.\n- **A** — 1\n<counter>Before you commit — x</counter>\nClosing.");
    expect(segs.map((s) => s.kind)).toEqual(["text", "counter", "text"]);
    expect(segs[1].text).toBe("Before you commit — x");
  });
  it("returns one text segment when there is no counter", () => {
    expect(splitCounters("Just text.")).toEqual([{ kind: "text", text: "Just text." }]);
  });
});
