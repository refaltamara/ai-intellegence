import { describe, expect, it } from "vitest";
import { textGroups } from "../Ask";

describe("textGroups", () => {
  it("keeps a lead paragraph separate from the bullets that follow it", () => {
    const g = textGroups("Wardah still leads.\n- **Share of voice** — 7.48% [ev_01]\n- **Direction** — down 4.33pts [ev_02]");
    expect(g).toEqual([
      { list: false, lines: ["Wardah still leads."] },
      { list: true, lines: ["**Share of voice** — 7.48% [ev_01]", "**Direction** — down 4.33pts [ev_02]"] },
    ]);
  });

  it("groups bullets the same way when a blank line separates them", () => {
    const withBlank = textGroups("Lead.\n\n- one\n- two");
    const without = textGroups("Lead.\n- one\n- two");
    expect(withBlank).toEqual(without);
  });

  it("accepts -, *, • and numbered bullets, and strips the marker", () => {
    for (const marker of ["-", "*", "•", "1.", "2)"]) {
      expect(textGroups(`${marker} item`)).toEqual([{ list: true, lines: ["item"] }]);
    }
  });

  it("keeps a closing paragraph after a list", () => {
    const g = textGroups("Lead.\n- one\n- two\nWorth acting on: brief more nano creators.");
    expect(g.map((x) => x.list)).toEqual([false, true, false]);
    expect(g[2].lines).toEqual(["Worth acting on: brief more nano creators."]);
  });

  it("joins consecutive prose lines into one paragraph and drops blank runs", () => {
    expect(textGroups("a\nb\n\n\nc")).toEqual([
      { list: false, lines: ["a", "b"] },
      { list: false, lines: ["c"] },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(textGroups("")).toEqual([]);
    expect(textGroups("\n\n")).toEqual([]);
  });

  it("does not treat a dash inside a sentence as a bullet", () => {
    expect(textGroups("Views fell 27.5% - a sharp drop.")).toEqual([{ list: false, lines: ["Views fell 27.5% - a sharp drop."] }]);
  });
});
