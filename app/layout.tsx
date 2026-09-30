import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/ui/Sidebar";
import { listConversations } from "@/chat/persist";
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { sql } from "@/db/client";
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
  const [recent, client, cfg, teams] = session && !bare
    ? await Promise.all([
        listConversations(ws, session.uid, 8).catch(() => []),
        sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [ws]).then((r) => ((r as { name: string }[])[0]?.name ?? null)).catch(() => null),
        getWorkspace(ws).catch(() => null),
        teamsFor(session).catch(() => []),
      ])
    : [[], null, null, []];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {session && !bare ? (
          <div className="app">
            <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled", href: c.decision_id ? `/d/${c.decision_id}?c=${c.id}` : `/?c=${c.id}` }))} user={{ email: session.email, role: session.role }} client={client} product={{ name: cfg?.product_name ?? "Fair Intelligence", tagline: cfg?.tagline ?? "", label: cfg?.category_label ?? ws, kind: cfg?.kind ?? "category" }} teams={teams} currentWorkspace={ws} />
            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
