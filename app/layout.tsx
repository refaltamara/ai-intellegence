import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/ui/Sidebar";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { listConversations } from "@/chat/persist";
import { currentSession } from "@/auth/current";
import { sql } from "@/db/client";

export const metadata = { title: "CeMO", description: "Your CMO — Creator Intelligence for Market Monitoring, on Fair's social listening data" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  const [recent, client] = session
    ? await Promise.all([
        listConversations(DEFAULT_WORKSPACE_ID, session.uid, 8).catch(() => []),
        sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [DEFAULT_WORKSPACE_ID]).then((r) => ((r as { name: string }[])[0]?.name ?? null)).catch(() => null),
      ])
    : [[], null];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {session ? (
          <div className="app">
            <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled", href: c.decision_id ? `/d/${c.decision_id}?c=${c.id}` : `/?c=${c.id}` }))} user={{ email: session.email, role: session.role }} client={client} />
            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
