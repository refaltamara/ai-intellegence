import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the weekly report's PDF (src/competitor/pdfdeck.ts): pdfkit runs from node_modules, and its font files ship with the routes that render it
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/cron/agents": ["./assets/fonts/**/*"],
    "/api/agents/[id]/run": ["./assets/fonts/**/*"],
  },
  // the consent screen must never be framed by another site (clickjacking)
  async headers() {
    return [{ source: "/oauth/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }];
  },
};

export default nextConfig;
