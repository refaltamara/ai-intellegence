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
import { cookies, headers } from "next/headers";
import { ShellProvider } from "@/ui/Shell";
import { LeavingCover, NavPendingProvider } from "@/ui/kit/NavPending";
import { PageLoading } from "@/ui/PageLoading";
import { MobileBar } from "@/ui/MobileBar";
import { caseNamesFor } from "@/cases/store";
import { sql } from "@/db/client";
import { currentBrand } from "@/brand/current";
import { AppSwitcher } from "@/ui/AppSwitcher";
import type { DemoBrand } from "@/brand/demo";

/** Pages that take the whole screen: sign-in, the team question, connector consent. */
const FULL_SCREEN = ["/login", "/reset", "/reset/", "/persona", "/oauth/", "/invite/", "/admin", "/admin/"];

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const [cfg, brand] = await Promise.all([getWorkspace(await currentWorkspaceId()).catch(() => null), currentBrand()]);
  return { title: brand?.name ?? cfg?.product_name ?? "Fair Intelligence", description: `${cfg?.tagline ?? "Social intelligence"} on Fair's social listening data` };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const ws = await currentWorkspaceId();
  const session = await currentSession();
  const path = (await headers()).get("x-pathname") ?? "";
  // a presenter's brand for the day, this browser only (src/brand/demo.ts)
  const brand = await currentBrand();
  const bare = FULL_SCREEN.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)));
  const [recent, cfg, actor, role] = session && !bare
    ? await Promise.all([
        listConversations(ws, session.uid, 8).catch(() => []),
        getWorkspace(ws).catch(() => null),
        currentActor().catch(() => null),
        currentRole(ws),
      ])
    : [[], null, null, BRAND_KOL];
  // "Our Chorus": the team's own version of its role; a Builder sees how many creations wait for them
  const builder = !!actor && can(actor, "company.change", { workspace: ws, role: role.id });
  const [teams, waiting, cases] = await Promise.all([
    actor ? teamsFor(actor).catch(() => []) : [],
    builder ? waitingCount(ws, role.id).catch(() => 0) : 0,
    // a case shows only to the people on its list (DECISIONS, 10 Oct 2026, step 5)
    actor ? caseNamesFor(actor, ws).then((c) => c.length).catch(() => 0) : 0,
  ]);
  const productName = brand?.name ?? cfg?.product_name ?? "Fair Intelligence";
  // the desktop sidebar's width, chosen with its Hide menu button (src/ui/Sidebar.tsx)
  const collapsed = (await cookies()).get("fi_sidebar")?.value === "1";
  const user = session ? { email: session.email, role: who(actor, ws, role.id, brand), team: !!actor && can(actor, "team.manage", { workspace: ws }), cms: !!actor && can(actor, "cms.open"), company: { label: `Our ${role.codename}`, waiting }, cases } : null;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {session && !bare ? (
          <ShellProvider>
            <NavPendingProvider>
            {/* "app has-apps" only marks the page for legacy.css (.app.has-apps .topbar keeps room for the app switcher) */}
            <div className={`${brand?.apps?.length ? "app has-apps" : "app"} flex h-dvh overflow-clip bg-gray-50 text-[#1C1C1C]`}>
              {brand?.apps?.length ? <AppSwitcher apps={brand.apps} owner={brand.short} /> : null}
              <Sidebar recent={recent.map((c) => ({ id: c.id, title: c.title ?? "Untitled", href: `/?c=${c.id}` }))} user={user!} product={{ name: productName, tagline: cfg?.tagline ?? "", label: cfg?.category_label ?? ws, kind: cfg?.kind ?? "category" }} teams={teams} currentWorkspace={ws} currentRole={role.id} collapsed={collapsed} />
              <div className="relative flex min-w-0 flex-1 flex-col overflow-clip">
                <MobileBar product={productName} />
                {/* overflow stays with legacy .main, so .main:has(.screen.ask) can still turn it off for Chats */}
                <main className="main min-h-0 flex-1 bg-gray-50 bg-none">{children}</main>
                <LeavingCover cover={<PageLoading label="Opening the team…" />} />
              </div>
            </div>
            </NavPendingProvider>
          </ShellProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}

/** what the account row says under the email: Fair duties, else the level on this team */
function who(actor: Actor | null, ws: string, role: Parameters<typeof levelOf>[2], brand: DemoBrand | null = null): string {
  if (!actor) return "";
  if (actor.staff.length) return `${brand ? "" : "Fair · "}${actor.staff.map((d) => DUTY_LABEL[d]).join(", ")}`;
  const l = levelOf(actor, ws, role);
  return l === "builder" ? "Builder" : l === "member" ? "Member" : "";
}

async function waitingCount(ws: string, role: string): Promise<number> {
  const r = (await sql.query("select count(*)::int as n from creations where workspace_id = $1 and role = $2 and status = 'waiting'", [ws, role])) as { n: number }[];
  return r[0]?.n ?? 0;
}
