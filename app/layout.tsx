import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/ui/Sidebar";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { listConversations } from "@/chat/persist";
import { currentSession } from "@/auth/current";

export const metadata = { title: "Fair Intel", description: "AI marketing intelligence on Fair's social listening data" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  const recent = session ? await listConversations(DEFAULT_WORKSPACE_ID, 8).catch(() => []) : [];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {session ? (
          <div className="app">
            <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled" }))} user={{ email: session.email, role: session.role }} />
            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
