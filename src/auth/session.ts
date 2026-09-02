/**
 * Session cookie: base64url(payload).base64url(HMAC-SHA256). Uses Web Crypto so
 * it runs in the request proxy and in route handlers alike. Secret: AUTH_SECRET,
 * falling back to CRON_SECRET so no extra variable is required on Vercel.
 */
export const SESSION_COOKIE = "fi_session";
export const SESSION_DAYS = 30;

export type SessionPayload = { uid: string; email: string; role: string; ws: string; exp: number };

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("AUTH_SECRET (or CRON_SECRET) must be set for login sessions");
  return s;
}

const enc = new TextEncoder();
const b64u = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(payload: Omit<SessionPayload, "exp">, days = SESSION_DAYS): Promise<string> {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + days * 86400 };
  const body = b64u(enc.encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(fromB64u(body).toString("utf8")) as SessionPayload;
    if (!payload.uid || !payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookieHeader(token: string, maxAgeDays = SESSION_DAYS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}${secure}`;
}
export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(cookieHeaderValue: string | null | undefined, name = SESSION_COOKIE): string | undefined {
  if (!cookieHeaderValue) return undefined;
  for (const part of cookieHeaderValue.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** Paths that never require a session. The cron route has its own secret. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/cron/") || pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname.startsWith("/icon");
}
