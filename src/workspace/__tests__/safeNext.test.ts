import { describe, expect, it } from "vitest";
import { safeNext } from "../teams";

describe("safeNext: only same-site paths after sign-in", () => {
  it("keeps paths on this site, query and hash included", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/decks/1?x=2#a")).toBe("/decks/1?x=2#a");
    expect(safeNext("/oauth/authorize?redirect_uri=https%3A%2F%2Fclaude.ai")).toBe("/oauth/authorize?redirect_uri=https%3A%2F%2Fclaude.ai");
  });
  it("refuses anything a browser would take to another site", () => {
    for (const x of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r//evil.com", "https://evil.com", "evil.com", "", null, undefined]) expect(safeNext(x)).toBeNull();
  });
});
