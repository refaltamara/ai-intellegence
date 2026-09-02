import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/ui/Sidebar";
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { listConversations } from "@/chat/persist";

export const metadata = { title: "Fair Intel", description: "AI marketing intelligence on Fair's social listening data" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const recent = await listConversations(DEFAULT_WORKSPACE_ID, 8).catch(() => []);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="app">
          <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled" }))} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
