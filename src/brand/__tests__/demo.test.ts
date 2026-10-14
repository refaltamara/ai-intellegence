import { describe, expect, it } from "vitest";
import { brandFrom, fairBadge, isFairBadge } from "../demo";

describe("presenter brand", () => {
  it("knows bpa and nothing else", () => {
    expect(brandFrom("bpa")?.name).toBe("BPA Listening");
    expect(brandFrom("fair")).toBeNull();
    expect(brandFrom("toString")).toBeNull();
    expect(brandFrom(undefined)).toBeNull();
  });
  it("relabels the role's own badge and still styles it as the role's", () => {
    expect(fairBadge(null)).toBe("Fair");
    expect(fairBadge(brandFrom("bpa"))).toBe("BPA");
    expect(isFairBadge("Fair")).toBe(true);
    expect(isFairBadge("BPA")).toBe(true);
    expect(isFairBadge("Paragon")).toBe(false);
    expect(isFairBadge(undefined)).toBe(false);
  });
});
