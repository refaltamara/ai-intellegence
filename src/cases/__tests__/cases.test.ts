import { describe, expect, it } from "vitest";
import { cleanCase } from "../store";

const ok = { name: "Boycott, October 2026", starts_on: "2026-10-06", access: ["Raissa@Example.com", "raissa@example.com"] };

describe("a case's settings", () => {
  it("keep whoever saves it on its access list, emails once each and in lower case", () => {
    const r = cleanCase(ok, "refal@fair-indonesia.com");
    expect(r.ok && r.value.access).toEqual(["refal@fair-indonesia.com", "raissa@example.com"]);
    expect(r.ok && r.value.pace).toBe("daily");
    expect(r.ok && r.value.ends_on).toBeNull();
  });
  it("refuse what does not hold, in plain words", () => {
    expect(cleanCase({ ...ok, name: "x" }, "a@b.co")).toMatchObject({ ok: false, error: expect.stringMatching(/name/) });
    expect(cleanCase({ ...ok, starts_on: "2026-02-30" }, "a@b.co")).toMatchObject({ ok: false, error: expect.stringMatching(/start date/) });
    expect(cleanCase({ ...ok, ends_on: "2026-10-01" }, "a@b.co")).toMatchObject({ ok: false, error: expect.stringMatching(/ends before/) });
    expect(cleanCase({ ...ok, access: ["not an email"] }, "a@b.co")).toMatchObject({ ok: false, error: expect.stringMatching(/not an email/) });
    expect(cleanCase({ ...ok, platforms: ["myspace"] }, "a@b.co")).toMatchObject({ ok: false, error: expect.stringMatching(/Platforms/) });
    expect(cleanCase({ ...ok, pace: "weekly" }, "a@b.co")).toMatchObject({ ok: false, error: expect.stringMatching(/daily or hourly/) });
  });
  it("keep each term once, whatever its case", () => {
    const r = cleanCase({ ...ok, terms: ["Boikot", "boikot", " support  local "] }, "a@b.co");
    expect(r.ok && r.value.terms).toEqual(["boikot", "support local"]);
  });
});
