import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

/**
 * Consumer sign-in / sign-up. Email + password only for V1 — Google, Apple and
 * phone can be added on top of the same Supabase Auth setup without changing
 * this screen's contract. Admin sign-in stays at /admin/login with MFA.
 */
export const Route = createFileRoute("/signin")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = typeof search.next === "string" && search.next.startsWith("/") ? search.next : undefined;
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Repara" },
      {
        name: "description",
        content: "Sign in to your Repara account to track your vehicle's maintenance, service history and repairs.",
      },
      { property: "og:title", content: "Sign in — Repara" },
      {
        property: "og:description",
        content: "Your car, understood. Sign in to your free Repara garage.",
      },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: next ?? "/garage", replace: true });
    });
  }, [navigate, next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { first_name: firstName.trim() },
            emailRedirectTo: `${window.location.origin}/garage`,
          },
        });
        if (error) throw error;
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          toast.success("Check your email to confirm your account, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
      navigate({ to: next ?? "/garage", replace: true });
    } catch (error) {
      toast.error((error as Error).message || "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-md items-center px-4">
          <Link to="/" aria-label="Repara home">
            <Logo className="h-7 w-auto" />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {mode === "signup" ? "Create your free account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Keep track of maintenance, service history and vehicle information in one place."
            : "Sign in to open your garage."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                className="h-12"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="h-12"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="h-12"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-12 w-full text-base">
            {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {mode === "signup" ? "I already have an account" : "I need an account"}
        </button>

        <p className="mt-8 text-xs text-muted-foreground">
          Need something fixed right now?{" "}
          <Link to="/quote" className="underline underline-offset-4">
            Request service without an account
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
