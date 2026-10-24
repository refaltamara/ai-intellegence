import { Suspense } from "react";
import { LoginForm } from "@/ui/LoginForm";
import { AuthShell } from "@/ui/AuthShell";
import { currentBrand } from "@/brand/current";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const brand = await currentBrand();
  return (
    <AuthShell product={brand?.name ?? "Fair Intelligence"} title="Sign in" subtitle="to your workspace">
      <Suspense><LoginForm owner={brand?.short ?? "Fair"} /></Suspense>
    </AuthShell>
  );
}
