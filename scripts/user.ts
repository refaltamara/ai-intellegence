/**
 * Account management (single workspace).
 *   pnpm user add <email> [--name "Name"] [--role owner|member] [--password xxx]   prints the password once
 *   pnpm user reset <email> [--password xxx]
 *   pnpm user remove <email>
 *   pnpm user list
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
    for (const u of await listUsers()) console.log(`${u.email.padEnd(36)} ${u.role.padEnd(8)} ${u.name ?? ""}`);
    return;
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("usage: pnpm user add|reset|remove <email> [--name ..] [--role ..] [--password ..] | pnpm user list");
    process.exit(2);
  }
  if (cmd === "add") {
    const password = arg("--password") ?? generatePassword();
    const u = await upsertUser({ email, name: arg("--name") ?? null, role: arg("--role") ?? "member", password });
    console.log(`account ready: ${u.email} (${u.role})\npassword: ${password}\n(shown once; use 'pnpm user reset' to change it)`);
  } else if (cmd === "reset") {
    const password = arg("--password") ?? generatePassword();
    if (!(await setPassword(email, password))) throw new Error(`no account for ${email}`);
    console.log(`password for ${email}: ${password}`);
  } else if (cmd === "remove") {
    console.log((await removeUser(email)) ? `removed ${email}` : `no account for ${email}`);
  } else {
    console.error(`unknown command ${cmd}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
