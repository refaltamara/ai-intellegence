import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/ui/Sidebar";
import { listConversations } from "@/chat/persist";
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { getWorkspace } from "@/workspace/store";
import { teamsFor } from "@/workspace/teams";
import { headers } from "next/headers";

/** Pages that take the whole screen: sign-in, the team question, connector consent. */
const FULL_SCREEN = ["/login", "/persona", "/oauth/"];

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
  const [recent, cfg, teams] = session && !bare
    ? await Promise.all([
        listConversations(ws, session.uid, 8).catch(() => []),
        getWorkspace(ws).catch(() => null),
        teamsFor(session).catch(() => []),
      ])
    : [[], null, []];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {session && !bare ? (
          <div className="app">
            <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled", href: `/?c=${c.id}` }))} user={{ email: session.email, role: session.role }} product={{ name: cfg?.product_name ?? "Fair Intelligence", tagline: cfg?.tagline ?? "", label: cfg?.category_label ?? ws, kind: cfg?.kind ?? "category" }} teams={teams} currentWorkspace={ws} />
            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
