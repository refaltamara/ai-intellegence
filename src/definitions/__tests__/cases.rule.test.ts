/**
 * A post only a case brought in never counts in the panel's everyday numbers (definition case_post; DECISIONS, 10 Oct
 * 2026, step 5). Every query that keeps set-aside posts out also keeps a case's own posts out: the two filters go together,
 * so a new panel query that copies one copies both.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" || n === "node_modules" || n === "migrations" ? [] : files(p);
    return /\.(ts|tsx|sql)$/.test(n) ? [p] : [];
  });
}

describe("a case's own posts stay out of the panel's numbers", () => {
  it("every relevance filter carries the case rule (or a scope's, postIn) beside it", () => {
    const missing: string[] = [];
    for (const f of [...files(path.join(process.cwd(), "src")), ...files(path.join(process.cwd(), "app"))]) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/relevant is not false(?! and (?:(?:\$\{[^}]+\}\.|\w+\.)?brought_in_by = 'panel'|\$\{postIn\())/g)) {
        const line = text.slice(0, m.index).split("\n").length;
        missing.push(`${path.relative(process.cwd(), f)}:${line}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
