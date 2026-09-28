import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

/**
 * Provider sign-in. Same Repara account system as drivers (one identity can
 * be both); lands in the provider workspace, never /admin. Access to provider
 * data is still enforced server-side per provider account.
 */
export const Route = createFileRoute("/provider/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next =
      typeof search.next === "string" && search.next.startsWith("/provider") && !search.next.startsWith("//")
        ? search.next
        : undefined;
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Provider login — Repara for Providers" },
      {
        name: "description",
        content: "Sign in to Repara for Providers to receive service requests, send quotes and talk with customers.",
      },
      { property: "og:title", content: "Repara for Providers — Sign in" },
      { property: "og:description", content: "Manage your Repara customers in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderLogin,
});

function ProviderLogin() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: next ?? "/provider", replace: true });
    });
  }, [navigate, next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      navigate({ to: next ?? "/provider", replace: true });
    } catch (error) {
      toast.error((error as Error).message || "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) {
      toast.error("Enter your email first, then tap Forgot password.");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/reset-password?for=provider`,
    });
    setResetting(false);
    if (error) toast.error(error.message || "Couldn't send the reset email.");
    else toast.success("If that email has an account, a reset link is on its way.");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link to="/" aria-label="Repara home">
            <Logo className="h-7 w-auto" />
          </Link>
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">For providers</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Manage your Repara customers in one place.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Receive service requests, send quotes, communicate with customers, and keep service history up to date.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-12" />
          </div>
          <Button type="submit" disabled={busy} className="h-12 w-full text-base">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => void forgot()}
          disabled={resetting}
          className="mt-4 self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {resetting ? "Sending…" : "Forgot password?"}
        </button>

        <div className="mt-10 border-t border-border/60 pt-6">
          <p className="text-sm text-muted-foreground">Don't have a provider account?</p>
          <Button asChild variant="outline" className="mt-3 h-12 w-full">
            <Link to="/signin" search={{ next: "/provider/onboarding" }}>Apply to become a provider</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
