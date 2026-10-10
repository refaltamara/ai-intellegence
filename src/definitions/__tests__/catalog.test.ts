/**
 * Every number has one definition, and a definition never changes in place (src/definitions/catalog.ts): its meaning and
 * SQL are held to the fingerprint recorded with its version. A change is a new version, recorded here with its new
 * fingerprint; the daily totals then say which catalog counted them.
 */
import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, DEFINITIONS, RECORDED, fingerprint, sqlOf } from "../catalog";

describe("definitions catalog", () => {
  it("records every definition with its version and fingerprint, and nothing else", () => {
    expect(Object.keys(RECORDED).sort()).toEqual([...DEFINITIONS.keys()].sort());
    for (const d of DEFINITIONS.values()) {
      const r = RECORDED[d.key];
      expect(d.version, `${d.key}: version`).toBe(r.version);
      expect(fingerprint(d), `${d.key} changed: give it a new version and record its new fingerprint`).toBe(r.fingerprint);
    }
  });

  it("says what each definition means, in plain words", () => {
    for (const d of DEFINITIONS.values()) {
      expect(d.name.length, d.key).toBeGreaterThan(2);
      expect(d.means.length, d.key).toBeGreaterThan(30);
    }
  });

  it("counts engagement from the parts the platform reports", () => {
    expect(sqlOf("engagement", "i")).toContain("coalesce(i.likes, 0) + coalesce(i.comments_count, 0) + coalesce(i.shares, 0) + coalesce(i.saves, 0)");
    expect(sqlOf("engagement_lc", "d")).toContain("coalesce(d.likes, 0) + coalesce(d.comments_count, 0)");
    expect(() => sqlOf("share_of_views", "x")).toThrow(/over a period/);
  });

  it("versions the catalog by its definitions' versions", () => {
    expect(CATALOG_VERSION).toMatch(/^v1:[0-9a-f]{8}$/);
  });
});
