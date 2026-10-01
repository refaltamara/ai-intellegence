/**
 * Pulse boards into decks (DECISIONS, 2 Oct 2026): each card becomes the slide that shows the same view
 * (rankings and KPIs → the scoreboard, tier mix → tiers, a pinned analysis → a finding), the cards'
 * brands become the watchlist, and their periods the grain. The deck is recurring and due now, so the
 * decks cron makes its first version, words included. The board itself stays where it was.
 *
 *   pnpm tsx scripts/pulses-to-decks.ts --workspace beauty-id --names "Creator Scouting,Hanasui Deepdive" [--dry]
 */
import { cleanSlides, type SlideKind } from "../src/competitor/slides";
import { sql } from "../src/db/client";
import { findingFromRun } from "../src/decks/fromChat";
import { brandLabel, cleanSpec, type FindingSpec } from "../src/decks/spec";
import { createDeck, updateDeck } from "../src/decks/store";
import { loadContext } from "../src/skills/params";
import { SkillDb } from "../src/skills/db";

const SLIDE: Record<string, SlideKind> = { kpi: "scoreboard", rankings: "scoreboard", trend: "trend", tiers: "tiers", tier_mix: "tiers", creators: "creators", content: "content", products: "products", posting: "posting", closeup: "closeups", patterns: "patterns", skill: "findings" };

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const ws = arg("workspace");
  const names = (arg("names") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ws || !names.length) throw new Error("--workspace and --names are required");
  const ctx = await loadContext(new SkillDb(), ws);
  const brandName = new Map(ctx.brands.map((b) => [b.id, brandLabel(b.name)]));
  const pulses = (await sql.query("select id, name, user_id from pulses where workspace_id = $1 and name = any($2::text[])", [ws, names])) as { id: string; name: string; user_id: string | null }[];
  for (const p of pulses) {
    const cards = (await sql.query("select kind, config, skill_run_id from pulse_cards where pulse_id = $1 order by position", [p.id])) as { kind: string; config: { brands?: string[]; platform?: string; period?: string }; skill_run_id: string | null }[];
    const brands = [...new Set(cards.flatMap((c) => c.config.brands ?? []))].filter((id) => brandName.has(id));
    const months = cards.filter((c) => /month|^\d{4}-\d{2}$/.test(c.config.period ?? "")).length;
    const grain = months > cards.length / 2 ? "month" : "week";
    const pls = [...new Set(cards.map((c) => c.config.platform ?? "all"))];
    const platforms = pls.length === 1 && pls[0] !== "all" ? [pls[0]] : ["tiktok", "instagram"];
    const findings: FindingSpec[] = [];
    for (const c of cards.filter((x) => x.kind === "skill" && x.skill_run_id)) {
      const f = await findingFromRun(c.skill_run_id!, ws);
      if (f) findings.push({ ...f, key: `f${findings.length + 1}` });
    }
    const slides = cleanSlides(["summary", ...cards.map((c) => SLIDE[c.kind]).filter(Boolean), "moves", "evidence"]);
    const spec = cleanSpec({ title: p.name, grain, platforms, client: null, watchlist: brands.map((id) => ({ name: brandName.get(id), brand_ids: [id] })), slides, findings }, new Set(brandName.keys()));
    if ("error" in spec) { console.log(`${p.name}: skipped (${spec.error})`); continue; }
    console.log(`${p.name}: ${grain}, ${platforms.join("+")}, ${spec.watchlist.map((w) => w.name).join(", ")}; slides ${spec.slides.join(", ")}${findings.length ? `; ${findings.length} findings` : ""}`);
    if (process.argv.includes("--dry")) continue;
    const deck = await createDeck({ workspaceId: ws, userId: p.user_id, name: p.name, source: "pulse", template: null, spec, recurring: true });
    await updateDeck(deck.id, ws, { next_run_at: new Date().toISOString() });
    console.log(`  → deck ${deck.id}, due now`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
