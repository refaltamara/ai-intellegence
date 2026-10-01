import { describe, expect, it } from "vitest";
import { captionSince } from "../run";

describe("caption reading start date", () => {
  it("keeps a real YYYY-MM-DD date and drops anything else", () => {
    expect(captionSince("2026-06-01")).toBe("2026-06-01");
    expect(captionSince("2026-02-30")).toBeNull();
    expect(captionSince("1 Jun 2026")).toBeNull();
    expect(captionSince("2026-06-01'; drop table posts; --")).toBeNull();
    expect(captionSince(null)).toBeNull();
    expect(captionSince(20260601)).toBeNull();
  });
});
