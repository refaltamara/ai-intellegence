"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { TextInput } from "./kit/TextInput";
import { Button } from "./kit/Button";
import { IconEye, IconEyeSlash } from "./kit/icons";
import { FormError, authLink } from "./AuthShell";

/** owner: who hands out invitations: Fair, or the presenter's brand for the day (src/brand/demo.ts) */
export function LoginForm({ owner = "Fair" }: { owner?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(j.error ?? `Login failed (${r.status})`);
      return;
    }
    // every sign-in asks which team you are working as (skipped when there is only one)
    const next = sp.get("next");
    const keep =
      next && next.startsWith("/") && !next.startsWith("//") && next !== "/"
        ? `?next=${encodeURIComponent(next)}`
        : "";
    router.push(`/persona${keep}`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <TextInput
        label="Email"
        type="email"
        autoComplete="username"
        placeholder="email@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
      />
      <TextInput
        label="Password"
        type={show ? "text" : "password"}
        placeholder="*********"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        right={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-brand-palette-600 hover:bg-brand-palette-50 focus-visible:outline-2 focus-visible:outline-brand-palette-600"
          >
            {show ? <IconEyeSlash /> : <IconEye />}
          </button>
        }
      />
      <a href="/reset" className={`-mt-2 self-end text-sm ${authLink}`}>
        Forgot your password?
      </a>
      {error && <FormError>{error}</FormError>}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        isLoading={busy}
        loadingLabel="Signing in…"
      >
        Sign in
      </Button>
      <p className="text-sm text-gray-500">
        No account yet? Ask your team&apos;s Builder or {owner} for an
        invitation.
      </p>
    </form>
  );
}
