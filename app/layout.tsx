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

/** Pages that take the whole screen: sign-in, the team question, connector consent. */
const FULL_SCREEN = ["/login", "/persona", "/oauth/", "/invite/", "/admin", "/admin/"];

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
  const user = session ? { email: session.email, role: who(actor, ws, role.id), team: !!actor && can(actor, "team.manage", { workspace: ws }), cms: !!actor && can(actor, "cms.open") } : null;
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
