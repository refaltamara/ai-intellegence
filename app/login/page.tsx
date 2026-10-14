import { Suspense } from "react";
import { LoginForm } from "@/ui/LoginForm";
import { LogoMark } from "@/ui/LogoMark";
import { currentBrand } from "@/brand/current";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const brand = await currentBrand();
  return (
    <div className="login">
      <div className="box">
        <div className="brand"><LogoMark /><div><b>{brand?.name ?? "Fair Intelligence"}</b><small>Sign in to your workspace</small></div></div>
        <Suspense><LoginForm owner={brand?.short ?? "Fair"} /></Suspense>
      </div>
    </div>
  );
}
