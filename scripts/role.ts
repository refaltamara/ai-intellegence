/**
 * Fair's roles as versions (CMS plan, phase 1), until the CMS has screens for it.
 *   pnpm role seed                                   each role's 1.0 from src/roles/model.ts
 *   pnpm role list                                   current version per role
 *   pnpm role history <role>                         every version, newest first
 *   pnpm role show <workspace> <role>                the resolved role a workspace runs on
 *   pnpm role draft <role> <version> --by Audia [--from spec.json] [--note ".."]
 *   pnpm role release <role> <version> --by Refal [--note ".."]
 *   pnpm role rollback <role> --by Wega [--note ".."]
 *   pnpm role pin <workspace> <role> <version|latest> --by Rafli
 *   pnpm role company <workspace> <role> path=value ... --by <name> [--note ".."]
 * <role> is pr | brand_kol | social, or a codename (chorus, atlas, spark).
 */
import { readFileSync } from "node:fs";
import { ROLES, isRoleId, type RoleId } from "../src/roles/model";
import { findAccountByWho } from "../src/auth/accounts";
import type { Who } from "../src/roles/store";
import { companyVersion, fairVersion, getRoleResolved, pinCompany, releaseVersion, roleHistory, rollbackRole, saveDraft, seedRoles, setCompanyChanges } from "../src/roles/store";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));

function roleOf(x: string | undefined): RoleId {
  const v = (x ?? "").toLowerCase();
  const byName = Object.values(ROLES).find((r) => r.codename.toLowerCase() === v);
  if (byName) return byName.id;
  if (isRoleId(v)) return v;
  throw new Error(`Unknown role "${x}": use pr, brand_kol, social or chorus, atlas, spark.`);
}

function parseValue(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function done(r: { ok: boolean; error?: string; version?: string }, what: string) {
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(`${what}: ${r.version}`);
}

/** --by names an account: an email or the part before the @ */
async function who(): Promise<Who> {
  const by = flag("--by");
  if (!by) throw new Error("--by is required (an email, or the name before the @)");
  const acc = await findAccountByWho(by);
  if (!acc) throw new Error(`No single account matches "${by}".`);
  return { email: acc.email, staff: acc.staff };
}

async function main() {
  const [cmd, a, b, c] = positional;
  const by = flag("--by") ?? "";
  const note = flag("--note");
  switch (cmd) {
    case "seed": {
      const added = await seedRoles(by || "seed");
      console.log(added.length ? `seeded ${added.map((r) => `${ROLES[r].codename} ${ROLES[r].version}`).join(", ")}` : "every role already has a version");
      break;
    }
    case "list":
      for (const r of Object.values(ROLES)) {
        const v = await fairVersion(r.id);
        console.log(`${r.codename.padEnd(7)} ${r.label.padEnd(18)} ${v ? v.version : "(built-in 1.0, not seeded)"}`);
      }
      break;
    case "history":
      for (const h of await roleHistory(roleOf(a))) console.log(`${h.version.padEnd(6)} ${h.status.padEnd(12)} ${h.released_by ?? ""} ${h.released_at?.slice(0, 16) ?? ""} ${h.rolled_back_by ? `rolled back by ${h.rolled_back_by}` : ""} ${h.release_note ?? ""}`);
      break;
    case "show": {
      const role = roleOf(b);
      const [r, company] = await Promise.all([getRoleResolved(a, role), companyVersion(a, role)]);
      console.log(JSON.stringify({ codename: r.role.codename, version: r.role.version, company_version: r.company_version, pinned: company?.base_version ?? null, changes: company?.overrides ?? {}, dropped: r.dropped }, null, 2));
      if (argv.includes("--full")) console.log(JSON.stringify(r.role, null, 2));
      break;
    }
    case "draft": {
      const spec = flag("--from") ? JSON.parse(readFileSync(flag("--from")!, "utf8")) : (await fairVersion(roleOf(a))) ?? {};
      done(await saveDraft(roleOf(a), b, spec, await who(), note), "draft saved");
      break;
    }
    case "release":
      done(await releaseVersion(roleOf(a), b, await who(), note), "released");
      break;
    case "rollback":
      done(await rollbackRole(roleOf(a), await who(), note), "rolled back; current is now");
      break;
    case "pin":
      done(await pinCompany(a, roleOf(b), c === "latest" ? null : c, await who()), "pinned");
      break;
    case "company": {
      const changes = Object.fromEntries(positional.slice(3).map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i), kv.slice(i + 1) === "" ? null : parseValue(kv.slice(i + 1))];
      }));
      const r = await setCompanyChanges(a, roleOf(b), changes, (await who()).email, note);
      console.log(`company version ${r.version}${r.dropped.length ? `; not allowed or out of range: ${r.dropped.join(", ")}` : ""}`);
      break;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
