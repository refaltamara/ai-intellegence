import { describe, expect, it } from "vitest";
import type { Actor } from "../can";
import { mayMakeLink } from "../passwordLinks";
import { SESSION_DAYS, issuedAt } from "../session";

const base: Actor = { uid: "00000000-0000-0000-0000-000000000000", account_id: "a", email: "me@example.com", name: null, staff: [], home: "ws1", memberships: [] };
const owner: Actor = { ...base, email: "owner@fair.example", staff: ["owner"] };
const ops: Actor = { ...base, email: "ops@fair.example", staff: ["data_ops"] };

describe("who may make a password link", () => {
  it("Refal or Rafli for anyone, data ops for clients only, everyone for themselves", () => {
    expect(mayMakeLink(owner, { email: "x@fair.example", staff: ["design"], workspaces: [] })).toBeNull();
    expect(mayMakeLink(ops, { email: "x@fair.example", staff: ["design"], workspaces: ["ws1"] })).toMatch(/Refal or Rafli/);
    expect(mayMakeLink(ops, { email: "c@client.example", staff: [], workspaces: ["ws1", "ws2"] })).toBeNull();
    expect(mayMakeLink(base, { email: "c@client.example", staff: [], workspaces: ["ws1"] })).toMatch(/Only Fair/);
    expect(mayMakeLink(base, { email: base.email, staff: [], workspaces: [] })).toBeNull();
  });
});

describe("sessions and a new password", () => {
  it("knows when a session was signed, also for cookies from before iat", () => {
    expect(issuedAt({ uid: "u", email: "e", role: "member", ws: "w", exp: 2_000_000, iat: 1_000 })).toBe(1_000);
    expect(issuedAt({ uid: "u", email: "e", role: "member", ws: "w", exp: 2_000_000 })).toBe(2_000_000 - SESSION_DAYS * 86400);
  });
});
