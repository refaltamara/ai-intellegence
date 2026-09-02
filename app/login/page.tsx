import { Suspense } from "react";
import { LoginForm } from "@/ui/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="brand" style={{ marginBottom: 18 }}><div className="mark">F</div><div><b>Fair Intel</b><small>Beauty · Indonesia</small></div></div>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  );
}
