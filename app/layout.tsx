import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/ui/Sidebar";
import { listConversations } from "@/chat/persist";
import { currentActor, currentRole, currentSession, currentWorkspaceId } from "@/auth/current";
import { can, levelOf, type Actor } from "@/auth/can";
import { DUTY_LABEL } from "@/config/staff";
import { BRAND_KOL } from "@/roles/model";
import { getWorkspace } from "@/workspace/store";
import { teamsFor } from "@/workspace/teams";
import { headers } from "next/headers";
import { caseNamesFor } from "@/cases/store";
import { sql } from "@/db/client";

/** Pages that take the whole screen: sign-in, the team question, connector consent. */
const FULL_SCREEN = ["/login", "/reset", "/reset/", "/persona", "/oauth/", "/invite/", "/admin", "/admin/"];

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const cfg = await getWorkspace(await currentWorkspaceId()).catch(() => null);
  return { title: cfg?.product_name ?? "Fair Intelligence", description: `${cfg?.tagline ?? "Social intelligence"} on Fair's social listening data` };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  const path = (await headers()).get("x-pathname") ?? "";
  const bare = FULL_SCREEN.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)));
  const [recent, cfg, actor, role] = session && !bare
    ? await Promise.all([
        listConversations(ws, session.uid, 8).catch(() => []),
        getWorkspace(ws).catch(() => null),
        currentActor().catch(() => null),
        currentRole(ws),
      ])
    : [[], null, null, BRAND_KOL];
  const teams = actor ? await teamsFor(actor).catch(() => []) : [];
  // "Our Chorus": the team's own version of its role; a Builder sees how many creations wait for them
  const builder = !!actor && can(actor, "company.change", { workspace: ws, role: role.id });
  const waiting = builder ? await waitingCount(ws, role.id).catch(() => 0) : 0;
  // a case shows only to the people on its list (DECISIONS, 10 Oct 2026, step 5)
  const cases = actor ? (await caseNamesFor(actor, ws).catch(() => [])).length : 0;
  const user = session ? { email: session.email, role: who(actor, ws, role.id), team: !!actor && can(actor, "team.manage", { workspace: ws }), cms: !!actor && can(actor, "cms.open"), company: { label: `Our ${role.codename}`, waiting }, cases } : null;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {session && !bare ? (
          <div className="app">
            <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled", href: `/?c=${c.id}` }))} user={user!} product={{ name: cfg?.product_name ?? "Fair Intelligence", tagline: cfg?.tagline ?? "", label: cfg?.category_label ?? ws, kind: cfg?.kind ?? "category" }} teams={teams} currentWorkspace={ws} currentRole={role.id} />
            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}

/** what the account row says under the email: Fair duties, else the level on this team */
function who(actor: Actor | null, ws: string, role: Parameters<typeof levelOf>[2]): string {
  if (!actor) return "";
  if (actor.staff.length) return `Fair · ${actor.staff.map((d) => DUTY_LABEL[d]).join(", ")}`;
  const l = levelOf(actor, ws, role);
  return l === "builder" ? "Builder" : l === "member" ? "Member" : "";
}

async function waitingCount(ws: string, role: string): Promise<number> {
  const r = (await sql.query("select count(*)::int as n from creations where workspace_id = $1 and role = $2 and status = 'waiting'", [ws, role])) as { n: number }[];
  return r[0]?.n ?? 0;
}
