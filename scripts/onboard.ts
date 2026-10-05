/**
 * Onboarding from the command line: the same steps as the CMS (src/onboard/), for very large dumps or a run without the app.
 *   pnpm onboard import etl/listening/<ws>.json        seed brands, handles, terms and the sentiment map from a contract file
 *   pnpm onboard export <ws>                           print the contract the CMS holds now (the JSON file is an export of it)
 *   pnpm onboard stage <ws> <dump dir>                 copy a dump's CSVs into the onboarding folder and register them
 *   pnpm onboard inspect <ws>                          the inspect report
 *   pnpm onboard load <ws>                             load in one go (the CMS runs the same job in slices)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { contractFromDb, importContract, patchSource, sourceOf, type StoredFile } from "../src/onboard/contract";
import { DUMP_TABLES, saveLocal, tableOf } from "../src/onboard/storage";
import { inspectDump, loadBlockers, loadSlice, type Progress } from "../src/onboard/load";

async function main() {
  const [, , cmd, a, b] = process.argv;
  if (cmd === "import") { const k = await importContract(a); console.log(`${k.workspace}: ${Object.keys(k.brands).length} brands`); return; }
  if (cmd === "export") { console.log(JSON.stringify(await contractFromDb(a), null, 2)); return; }
  if (cmd === "stage") {
    const files: Record<string, StoredFile> = { ...((await sourceOf(a)).config.files ?? {}) };
    for (const n of readdirSync(b)) {
      const t = tableOf(n);
      // only what the loader reads; the dump's other tables are known and left out (src/onboard/storage.ts)
      if (!t || !(DUMP_TABLES as readonly string[]).includes(t)) continue;
      const saved = await saveLocal(a, n, readFileSync(path.join(b, n)));
      files[t] = { table: t, name: n, url: saved.url, size: saved.size, at: new Date().toISOString() };
      console.log(`${t.padEnd(26)} ${n}`);
    }
    await patchSource(a, { files });
    return;
  }
  if (cmd === "inspect") { const r = await inspectDump(a); console.log(JSON.stringify({ ...r, handles: r.handles.length, suggestions: r.suggestions.map((s) => `${s.id}: ${s.handles.map((h) => h.handle).join(", ")}`) }, null, 1)); return; }
  if (cmd === "load") {
    const block = await loadBlockers(a);
    if (block.length) throw new Error(block.join(" "));
    let p: Progress = { phase: "prepare", offset: 0 };
    const t0 = Date.now();
    for (;;) {
      const r = await loadSlice(a, p, 10 * 60_000);
      console.log(`${Math.round((Date.now() - t0) / 1000)}s ${r.note}`);
      p = r.progress;
      if (r.done) break;
    }
    console.log(JSON.stringify(p.counts));
    return;
  }
  console.error("usage: pnpm onboard import|export|stage|inspect|load …");
  process.exit(2);
}
main().then(() => process.exit(0)).catch((e) => { console.error((e as Error).message); process.exit(1); });
