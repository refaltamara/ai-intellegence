/**
 * Request gate (Next 16 proxy): every page and API route needs a valid session
 * cookie except /login, /api/auth/*, /api/cron/* (CRON_SECRET) and static assets (incl. /fonts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { stillActive } from "@/auth/live";
import { clearCookieHeader, isPublicPath, readCookie, verifySession } from "@/auth/session";

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // the layout reads this to leave the sidebar off full-screen pages (sign-in, the team question, connector consent)
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const pass = () => NextResponse.next({ request: { headers } });
  if (isPublicPath(pathname)) return pass();
  const session = await verifySession(readCookie(req.headers.get("cookie")));
  if (session && (await stillActive(session.uid))) return pass();
  const res = pathname.startsWith("/api/")
    ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
    : (() => {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.search = `?next=${encodeURIComponent(pathname + search)}`;
        return NextResponse.redirect(url);
      })();
  // a signed cookie for an account that no longer exists is cleared, not honoured
  if (session) res.headers.append("Set-Cookie", clearCookieHeader());
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
