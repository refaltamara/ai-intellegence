import { Suspense } from "react";
import { LoginForm } from "@/ui/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="brand" style={{ marginBottom: 18 }}><div className="mark">C</div><div><b>CeMO</b><small>Your CMO · Creator Intelligence for Market Monitoring</small></div></div>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  );
}
