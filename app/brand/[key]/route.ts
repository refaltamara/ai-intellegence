/**
 * /brand/bpa: this browser shows the app as BPA Listening for a day (Fair staff only); /brand/fair: back to Fair's own.
 * ?next=/decks lands on that page instead of the Dashboard, so a slide can link straight into a screen.
 * The proxy already asks for a session; what it changes is in src/brand/demo.ts.
 */
import { NextResponse } from "next/server";
import { currentActor } from "@/auth/current";
import { BRAND_COOKIE, BRAND_MAX_AGE, brandFrom } from "@/brand/demo";
import { safeNext } from "@/workspace/teams";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const next = safeNext(new URL(req.url).searchParams.get("next")) ?? "/dashboard";
  const res = NextResponse.redirect(new URL(next, req.url));
  if (key === "fair") {
    res.cookies.delete(BRAND_COOKIE);
    return res;
  }
  const brand = brandFrom(key);
  const actor = await currentActor();
  if (!brand || !actor?.staff.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  res.cookies.set(BRAND_COOKIE, brand.key, { path: "/", maxAge: BRAND_MAX_AGE, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}
