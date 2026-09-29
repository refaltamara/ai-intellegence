import { Suspense } from "react";
import { LoginForm } from "@/ui/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="login">
      <div className="box">
        <div className="brand"><div className="mark">F</div><div><b>Fair Intelligence</b><small>Sign in to your workspace</small></div></div>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  );
}
