import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AFFILIATE_RULE, SOURCE_TZ, TIER_BANDS, tierForFollowers } from "../src/config/thresholds";

/** etl/config.py must mirror src/config/thresholds.ts (CLAUDE.md rule 5). */
describe("thresholds are mirrored in etl/config.py", () => {
  const py = readFileSync("etl/config.py", "utf8");

  it("tier bands match", () => {
    for (const b of TIER_BANDS) {
      const max = b.max == null ? "None" : b.max.toLocaleString("en-US").replace(/,/g, "_");
      const min = b.min.toLocaleString("en-US").replace(/,/g, "_");
      const re = new RegExp(`\\("${b.tier}",\\s*"${b.label.replace("&", "&")}",\\s*${min},\\s*${max}\\)`);
      expect(py, `band ${b.tier}`).toMatch(re);
    }
  });

  it("affiliate rule and source tz match", () => {
    expect(py).toContain(`"min_cart_posts": ${AFFILIATE_RULE.min_cart_posts}`);
    expect(py).toContain(`SOURCE_TZ = "${SOURCE_TZ}"`);
  });
});

describe("tierForFollowers", () => {
  it("applies the DECISIONS bands", () => {
    expect(tierForFollowers(0)).toBeNull();
    expect(tierForFollowers(null)).toBeNull();
    expect(tierForFollowers(1)).toBe("nano");
    expect(tierForFollowers(10_000)).toBe("nano");
    expect(tierForFollowers(10_001)).toBe("micro");
    expect(tierForFollowers(50_000)).toBe("micro");
    expect(tierForFollowers(50_001)).toBe("mid");
    expect(tierForFollowers(500_000)).toBe("mid");
    expect(tierForFollowers(500_001)).toBe("macro");
    expect(tierForFollowers(1_000_000)).toBe("macro");
    expect(tierForFollowers(1_000_001)).toBe("mega");
  });
});
