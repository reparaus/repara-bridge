import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/reset-password")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { for?: "provider" } =>
    search.for === "provider" ? { for: "provider" } : {},
  head: () => ({
    meta: [
      { title: "Reset Admin Password — Repara" },
      {
        name: "description",
        content: "Set a new password for your Repara admin account.",
      },
      { property: "og:title", content: "Reset Admin Password — Repara" },
      {
        property: "og:description",
        content: "Set a new password for your Repara admin account.",
      },
      { name: "robots", content: "noindex" },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type Stage = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { for: audience } = Route.useSearch();
  const backToSignIn = () =>
    audience === "provider"
      ? navigate({ to: "/provider/login", replace: true })
      : navigate({ to: "/admin/login", search: { reset: true }, replace: true });
  const [stage, setStage] = useState<Stage>("checking");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function establish() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      try {
        // PKCE-style recovery links arrive with ?code=...
        const code = url.searchParams.get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        // Token-hash links arrive with ?token_hash=...&type=recovery
        const tokenHash = url.searchParams.get("token_hash");
        if (!code && tokenHash) {
          await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        }

        // Implicit links arrive with #access_token=...&refresh_token=...
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (!code && !tokenHash && accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      } catch {
        // fall through to the session check below
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStage(data.session ? "ready" : "invalid");
    }

    void establish();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(error.message || "Couldn't update your password.");
      return;
    }

    // Force a clean sign-in (password + TOTP) with the new password.
    await supabase.auth.signOut();
    setBusy(false);
    backToSignIn();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="surface-panel w-full max-w-sm space-y-6 p-7">
        <div className="text-center">
          <Logo />
          <p className="mt-3 text-xs tracking-[0.2em] text-muted-foreground uppercase">
            Reset password
          </p>
        </div>

        {stage === "checking" ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {stage === "invalid" ? (
          <div className="space-y-5">
            <p className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm text-muted-foreground">
              This recovery link is invalid or has expired. Request a new one from the sign in
              screen.
            </p>
            <Button
              size="lg"
              className="h-12 w-full rounded-full"
              onClick={backToSignIn}
            >
              BACK TO SIGN IN
            </Button>
          </div>
        ) : null}

        {stage === "ready" ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="size-4" /> Choose a new admin password.
            </div>
            <Field label="New password" htmlFor="new-password">
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
                required
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm-password">
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-12"
                required
              />
            </Field>
            <Button type="submit" size="lg" className="h-12 w-full rounded-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} UPDATE PASSWORD
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
