/**
 * Account management. An account belongs to one workspace (default beauty-id); owners can switch workspaces in the app.
 *   pnpm user add <email> [--workspace id] [--name "Name"] [--role owner|member] [--password xxx]   prints the password once
 *   pnpm user reset <email> [--workspace id] [--password xxx]
 *   pnpm user remove <email> [--workspace id]
 *   pnpm user list [--workspace id]
 */
import { generatePassword } from "../src/auth/password";
import { listUsers, removeUser, setPassword, upsertUser } from "../src/auth/users";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [, , cmd, email] = process.argv;
  if (cmd === "list") {
    for (const u of await listUsers(arg("--workspace"))) console.log(`${u.workspace_id.padEnd(14)} ${u.email.padEnd(36)} ${u.role.padEnd(8)} ${u.name ?? ""}`);
    return;
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("usage: pnpm user add|reset|remove <email> [--name ..] [--role ..] [--password ..] | pnpm user list");
    process.exit(2);
  }
  if (cmd === "add") {
    const password = arg("--password") ?? generatePassword();
    const u = await upsertUser({ email, name: arg("--name") ?? null, role: arg("--role") ?? "member", password, workspaceId: arg("--workspace") });
    console.log(`account ready: ${u.email} (${u.role}, workspace ${u.workspace_id})\npassword: ${password}\n(shown once; use 'pnpm user reset' to change it)`);
  } else if (cmd === "reset") {
    const password = arg("--password") ?? generatePassword();
    if (!(await setPassword(email, password, arg("--workspace")))) throw new Error(`no account for ${email}`);
    console.log(`password for ${email}: ${password}`);
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
