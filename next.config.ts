import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the weekly report's and decks' PDF (src/competitor/pdfdeck.ts): pdfkit runs from node_modules, and its font files ship with the routes that render it
  serverExternalPackages: ["pdfkit"],
  // onboarding without Vercel Blob (local runs) uploads a dump's CSVs through the app, one file at a time (src/onboard/storage.ts);
  // on Vercel the browser uploads straight to Blob and this limit is never reached
  experimental: { proxyClientMaxBodySize: "200mb" },
  outputFileTracingIncludes: {
    "/api/cron/agents": ["./assets/fonts/**/*"],
    "/api/agents/[id]/run": ["./assets/fonts/**/*"],
    "/api/decks": ["./assets/fonts/**/*"],
    "/api/decks/[id]/versions": ["./assets/fonts/**/*"],
    "/api/decks/from-chat": ["./assets/fonts/**/*"],
    "/api/cron/decks": ["./assets/fonts/**/*"],
  },
  // the consent screen must never be framed by another site (clickjacking)
  async headers() {
    return [{ source: "/oauth/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }];
  },
};

export default nextConfig;
