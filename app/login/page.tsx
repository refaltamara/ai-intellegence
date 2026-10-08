import { Suspense } from "react";
import { LoginForm } from "@/ui/LoginForm";
import { LogoMark } from "@/ui/LogoMark";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="login">
      <div className="box">
        <div className="brand"><LogoMark /><div><b>Fair Intelligence</b><small>Sign in to your workspace</small></div></div>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  );
}
