import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "../password";
import { isPublicPath, readCookie, signSession, verifySession } from "../session";

describe("passwords", () => {
  it("hashes and verifies; rejects wrong and malformed", () => {
    const h = hashPassword("s3cret-Pass");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("s3cret-Pass", h)).toBe(true);
    expect(verifyPassword("s3cret-pass", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
    expect(generatePassword(20)).toHaveLength(20);
  });
});

describe("sessions", () => {
  process.env.AUTH_SECRET = "test-secret";
  it("round-trips and rejects tampering and expiry", async () => {
    const t = await signSession({ uid: "u1", email: "a@b.c", role: "owner", ws: "beauty-id" });
    const s = await verifySession(t);
    expect(s?.email).toBe("a@b.c");
    expect(await verifySession(t.slice(0, -2) + "zz")).toBeNull();
    const expired = await signSession({ uid: "u1", email: "a@b.c", role: "owner", ws: "beauty-id" }, -1);
    expect(await verifySession(expired)).toBeNull();
    expect(readCookie(`x=1; fi_session=${t}; y=2`)).toBe(t);
  });
  it("keeps login, auth and cron public and everything else private", () => {
    for (const p of ["/login", "/api/auth/login", "/api/cron/agents", "/_next/static/x.js"]) expect(isPublicPath(p), p).toBe(true);
    for (const p of ["/", "/skills", "/api/chat", "/api/agents", "/reports/x"]) expect(isPublicPath(p), p).toBe(false);
  });
});
