import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/ui/Sidebar";
import { listConversations } from "@/chat/persist";
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { sql } from "@/db/client";
import { getWorkspace, listWorkspaces } from "@/workspace/store";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const cfg = await getWorkspace(await currentWorkspaceId()).catch(() => null);
  return { title: cfg?.product_name ?? "Fair Intelligence", description: `${cfg?.tagline ?? "Social intelligence"} on Fair's social listening data` };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  const [recent, client, cfg, all] = session
    ? await Promise.all([
        listConversations(ws, session.uid, 8).catch(() => []),
        sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [ws]).then((r) => ((r as { name: string }[])[0]?.name ?? null)).catch(() => null),
        getWorkspace(ws).catch(() => null),
        session.role === "owner" ? listWorkspaces().catch(() => []) : Promise.resolve([]),
      ])
    : [[], null, null, []];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {session ? (
          <div className="app">
            <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled", href: c.decision_id ? `/d/${c.decision_id}?c=${c.id}` : `/?c=${c.id}` }))} user={{ email: session.email, role: session.role }} client={client} product={{ name: cfg?.product_name ?? "Fair Intelligence", tagline: cfg?.tagline ?? "", label: cfg?.category_label ?? ws, kind: cfg?.kind ?? "category" }} workspaces={all} currentWorkspace={ws} />
            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
