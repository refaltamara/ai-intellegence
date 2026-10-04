/**
 * People (CMS plan, phase 2): one account per person, a membership per workspace.
 *   pnpm user add <email> [--workspace id] [--name "Name"] [--level builder|member] [--password xxx]   prints the password once
 *   pnpm user reset <email> [--password xxx]
 *   pnpm user staff <email> owner,role_owner,designer,data_ops    Fair duties ("" for none); prefer the CMS (People)
 *   pnpm user remove <email> [--workspace id]                      without --workspace: from every workspace
 *   pnpm user list [--workspace id]
 */
import { generatePassword } from "../src/auth/password";
import { isDuty } from "../src/config/staff";
import { listUsers, removeUser, setDuties, setPassword, upsertUser } from "../src/auth/users";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [, , cmd, email] = process.argv;
  if (cmd === "list") {
    for (const u of await listUsers(arg("--workspace"))) console.log(`${u.workspace_id.padEnd(14)} ${u.email.padEnd(36)} ${(u.staff.join(",") || "-").padEnd(22)} ${Object.entries(u.levels).map(([r, l]) => `${r}:${l}`).join(" ")}`);
    return;
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("usage: pnpm user add|reset|staff|remove <email> [..] | pnpm user list");
    process.exit(2);
  }
  if (cmd === "add") {
    const password = arg("--password") ?? generatePassword();
    const level = arg("--level") === "builder" ? "builder" : "member";
    const u = await upsertUser({ email, name: arg("--name") ?? null, level, password, workspaceId: arg("--workspace") });
    console.log(`account ready: ${u.email} (${level}, workspace ${u.workspace_id})\npassword: ${password}\n(shown once; use 'pnpm user reset' to change it)`);
  } else if (cmd === "reset") {
    const password = arg("--password") ?? generatePassword();
    if (!(await setPassword(email, password))) throw new Error(`no account for ${email}`);
    console.log(`password for ${email}: ${password}`);
  } else if (cmd === "staff") {
    const duties = (process.argv[4] ?? "").split(",").map((d) => d.trim()).filter(Boolean);
    if (!duties.every(isDuty)) throw new Error("duties are owner, role_owner, designer, data_ops");
    if (!(await setDuties(email, duties))) throw new Error(`no account for ${email}`);
    console.log(`${email}: ${duties.join(", ") || "no Fair duties"}`);
  } else if (cmd === "remove") {
    console.log((await removeUser(email, arg("--workspace"))) ? `removed ${email}` : `no account for ${email}`);
  } else {
    console.error(`unknown command ${cmd}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
