/**
 * Every role is released and every workspace × role runs it (CMS plan). At phase 1 each release was the 1.0 in
 * src/roles/model.ts; releases have moved on since (Chorus 1.2 carries the crisis slides, DECISIONS 7 Oct 2026), so a
 * release is the constant's role at its version or later, and a workspace with no company changes runs its role's
 * current release (stages honoured). Against the loaded database (DATABASE_URL); skipped without it. Read-only.
 */
import { describe, expect, it } from "vitest";
import { ROLES } from "../model";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;

d("roles in the database", () => {
  it("each role has a release, the constant's role at its version or later", async () => {
    const { fairVersion } = await import("../store");
    const num = (v: string) => v.split(".").map(Number);
    for (const r of Object.values(ROLES)) {
      const v = await fairVersion(r.id);
      expect(v, `${r.codename} is not seeded: run pnpm role seed`).not.toBeNull();
      expect([v!.id, v!.codename]).toEqual([r.id, r.codename]);
      const [ma, mi] = num(v!.version), [ca, ci] = num(r.version);
      expect(ma > ca || (ma === ca && mi >= ci), `${r.codename} ${v!.version} is older than ${r.version}`).toBe(true);
    }
  });

  it("every workspace × role it offers resolves, and with no company changes runs the role's current release", async () => {
    const [{ listWorkspaces, getWorkspace }, { getRoleResolved, companyVersion, fairVersion }] = await Promise.all([import("../../workspace/store"), import("../store")]);
    const ws = await listWorkspaces();
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws) {
      const cfg = await getWorkspace(w.id);
      for (const id of cfg!.roles) {
        const [resolved, company] = await Promise.all([getRoleResolved(w.id, id), companyVersion(w.id, id)]);
        expect(resolved.dropped, `${w.id}:${id}`).toEqual([]);
        if (!company) expect(resolved.role, `${w.id}:${id}`).toEqual(await fairVersion(id, null, w.id));
      }
    }
  });
});
