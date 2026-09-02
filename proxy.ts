/**
 * Request gate (Next 16 proxy): every page and API route needs a valid session
 * cookie except /login, /api/auth/*, /api/cron/* (CRON_SECRET) and static assets.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, readCookie, verifySession } from "@/auth/session";

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const session = await verifySession(readCookie(req.headers.get("cookie")));
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
