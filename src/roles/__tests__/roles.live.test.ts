/**
 * Phase 1 is done when every workspace × role resolves to today's behaviour (CMS plan):
 * the released 1.0 in role_versions equals the constant in src/roles/model.ts, and a
 * workspace with no company changes runs exactly that. Against the loaded database
 * (DATABASE_URL); skipped without it. Read-only.
 */
import { describe, expect, it } from "vitest";
import { ROLES } from "../model";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;

d("roles in the database", () => {
  it("each role's current release is its 1.0, equal to the constant", async () => {
    const { fairVersion } = await import("../store");
    for (const r of Object.values(ROLES)) {
      const v = await fairVersion(r.id);
      expect(v, `${r.codename} is not seeded: run pnpm role seed`).not.toBeNull();
      expect(v).toEqual(r);
    }
  });

  it("every workspace × role it offers resolves to the role it ran on before", async () => {
    const [{ listWorkspaces, getWorkspace }, { getRoleResolved, companyVersion }] = await Promise.all([import("../../workspace/store"), import("../store")]);
    const ws = await listWorkspaces();
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws) {
      const cfg = await getWorkspace(w.id);
      for (const id of cfg!.roles) {
        const [resolved, company] = await Promise.all([getRoleResolved(w.id, id), companyVersion(w.id, id)]);
        expect(resolved.dropped, `${w.id}:${id}`).toEqual([]);
        if (!company) expect(resolved.role, `${w.id}:${id}`).toEqual(ROLES[id]);
      }
    }
  });
});
