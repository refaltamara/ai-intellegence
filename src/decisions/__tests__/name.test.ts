import { describe, expect, it } from "vitest";
import { decisionNameFrom } from "../store";

describe("decisionNameFrom", () => {
  it("uses the prompt, trimmed and collapsed", () => {
    expect(decisionNameFrom("  find   creators for Ramadan ")).toBe("find creators for Ramadan");
  });
  it("drops a leading slash command", () => {
    expect(decisionNameFrom("/discovery 50 nano creators")).toBe("50 nano creators");
  });
  it("shortens long prompts on a word boundary with an ellipsis", () => {
    const n = decisionNameFrom("compare Wardah and Skintific on TikTok for the whole of June and tell me who is winning on nano creators");
    expect(n.length).toBeLessThanOrEqual(72);
    expect(n.endsWith("…")).toBe(true);
  });
  it("falls back to Untitled", () => {
    expect(decisionNameFrom("   ")).toBe("Untitled");
  });
});
