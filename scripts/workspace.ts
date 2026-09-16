/**
 * Workspaces are subjects: a category panel of brands, one artist, one executive.
 *   pnpm workspace add <id> --name "Maudy Ayunda" --kind profile [--category music] [--tz Asia/Jakarta] [--product "Fair Intelligence"] [--tagline ".."] [--label "Maudy Ayunda · Music"]
 *   pnpm workspace set <id> [--name ..] [--kind ..] [--product ..] [--tagline ..] [--label ..] [--noun accounts] [--persona ".."] [--hero-title ".."] [--hero-intro ".."] [--suggested "q1|q2|q3"]
 *   pnpm workspace set <id> --partners "From This Island:fromthisisland,fti|Oatside" [--boycott-terms "boikot|boycott"]
 *   pnpm workspace list
 */
import { createWorkspace, listWorkspaces, updateWorkspaceSettings } from "../src/workspace/store";
import type { WorkspaceKind, WorkspaceSettings } from "../src/workspace/config";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function settingsFromArgs(): WorkspaceSettings {
  const s: WorkspaceSettings = {};
  if (arg("--product")) s.product_name = arg("--product");
  if (arg("--tagline")) s.tagline = arg("--tagline");
  if (arg("--label")) s.category_label = arg("--label");
  if (arg("--noun")) s.subject_noun = arg("--noun");
  if (arg("--persona")) s.persona = arg("--persona");
  if (arg("--hero-title")) s.hero_title = arg("--hero-title");
  if (arg("--hero-intro")) s.hero_intro = arg("--hero-intro");
  if (arg("--suggested")) s.suggested = String(arg("--suggested")).split("|").map((x) => x.trim()).filter(Boolean);
  // --partners "From This Island:fromthisisland,fti|Oatside|Le Minerale"
  // Each entry is a display name and, after the colon, the words to match it by.
  if (arg("--partners") !== undefined) {
    const partners = String(arg("--partners")).split("|").map((x) => x.trim()).filter(Boolean).map((entry) => {
      const [name, terms] = entry.split(":");
      return { name: name.trim(), terms: (terms ?? "").split(",").map((t) => t.trim()).filter(Boolean) };
    });
    s.commercial = { ...(s.commercial ?? {}), partners };
  }
  if (arg("--boycott-terms") !== undefined) {
    s.commercial = { ...(s.commercial ?? {}), boycott_terms: String(arg("--boycott-terms")).split("|").map((x) => x.trim()).filter(Boolean) };
  }
  return s;
}

async function main() {
  const [, , cmd, id] = process.argv;
  if (cmd === "list") {
    for (const w of await listWorkspaces()) console.log(`${w.id.padEnd(16)} ${w.kind.padEnd(9)} ${w.product_name.padEnd(18)} ${w.name}`);
    return;
  }
  if (!id || !/^[a-z0-9-]{1,60}$/.test(id)) {
    console.error("usage: pnpm workspace add|set <id> [options] | pnpm workspace list  (id: lowercase letters, digits, dashes)");
    process.exit(2);
  }
  const kind = arg("--kind") as WorkspaceKind | undefined;
  if (kind && kind !== "category" && kind !== "profile") throw new Error("--kind must be category or profile");
  if (cmd === "add") {
    const name = arg("--name");
    if (!name) throw new Error("--name is required");
    await createWorkspace({ id, name, kind: kind ?? "category", category: arg("--category") ?? null, tz: arg("--tz"), settings: settingsFromArgs() });
    console.log(`workspace ${id} ready (${kind ?? "category"}): ${name}`);
  } else if (cmd === "set") {
    const ok = await updateWorkspaceSettings(id, { ...settingsFromArgs(), kind, name: arg("--name") });
    console.log(ok ? `workspace ${id} updated` : `no workspace ${id}`);
  } else {
    console.error(`unknown command ${cmd}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
