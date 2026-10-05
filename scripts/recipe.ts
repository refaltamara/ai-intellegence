/**
 * Recipes (src/recipes/), until the Role Lab writes them.
 *   pnpm recipe seed                                   Fair's library (src/recipes/library.ts)
 *   pnpm recipe list
 *   pnpm recipe run <key> <workspace> [--brand gopay] [--days 30] [--platform x]
 */
import { fairRecipes, seedRecipes } from "../src/recipes/store";
import { runRecipe } from "../src/recipes/run";

const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

async function main() {
  const [cmd, key, ws] = argv;
  if (cmd === "seed") console.log(`seeded: ${(await seedRecipes()).join(", ") || "nothing new"}`);
  else if (cmd === "list") for (const r of (await fairRecipes()).values()) console.log(`${r.key.padEnd(24)} ${r.roles.join(",").padEnd(18)} ${r.title}`);
  else if (cmd === "run") {
    const r = (await fairRecipes()).get(key);
    if (!r) throw new Error(`no recipe ${key}`);
    const res = await runRecipe(r, { brand: flag("--brand"), window: flag("--days") ? { last_n_days: Number(flag("--days")) } : undefined, platform: flag("--platform") }, ws);
    console.log(JSON.stringify({ status: res.status, message: res.message, window: res.window, rows: res.rows.slice(0, 8), evidence: res.evidence.length, caveats: res.meta.caveats }, null, 2));
  } else console.log("pnpm recipe seed | list | run <key> <workspace> [--brand ..] [--days ..] [--platform ..]");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
