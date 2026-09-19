import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, QrCode } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/login")({
  validateSearch: z.object({
    denied: z.boolean().optional(),
    reset: z.boolean().optional(),
    // Where to land after a successful sign-in, so deep links survive the gate.
    next: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Admin Sign In — Repara" },
      {
        name: "description",
        content: "Repara internal admin sign in with authenticator app multi-factor auth.",
      },
      { property: "og:title", content: "Admin Sign In — Repara" },
      {
        property: "og:description",
        content: "Repara internal admin sign in with authenticator app multi-factor auth.",
      },
      { name: "robots", content: "noindex" },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLoginPage,
});

type Stage = "loading" | "password" | "enroll" | "verify";

function AdminLoginPage() {
  const navigate = useNavigate();
  const { denied, reset, next } = Route.useSearch();
  // Only same-origin admin paths are ever honoured as a redirect target.
  const destination = next && /^\/admin(\/|$)/.test(next) ? next : "/admin";

  const [stage, setStage] = useState<Stage>("loading");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  /** Decides what the admin has to do next based on session + MFA state. */
  const resolveStage = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setStage("password");
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      navigate({ to: destination, replace: true });
      return;
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp ?? []).find((f) => f.status === "verified");

    if (verified) {
      setFactorId(verified.id);
      setStage("verify");
      return;
    }

    // Clean up any half-finished enrollment so a retry can start fresh.
    for (const f of factors?.totp ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data: enrolled, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Repara Admin ${Date.now()}`,
    });
    if (error || !enrolled) {
      toast.error(error?.message ?? "Couldn't start authenticator setup.");
      setStage("password");
      return;
    }
    setFactorId(enrolled.id);
    setQrCode(enrolled.totp.qr_code);
    setSecret(enrolled.totp.secret);
    setStage("enroll");
  }, [navigate]);

  useEffect(() => {
    if (reset) toast.success("Password updated. Sign in with your new password.");
  }, [reset]);

  useEffect(() => {
    if (denied) {
      void supabase.auth.signOut().then(() => {
        setStage("password");
        toast.error("This account doesn't have Repara admin access.");
      });
      return;
    }
    void resolveStage();
  }, [denied, resolveStage]);

  async function handleForgotPassword() {
    const target = email.trim();
    if (!target) {
      toast.error("Enter your admin email first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Couldn't send the reset email.");
      return;
    }
    toast.success("Check your email for a password reset link.");
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      toast.error("Those credentials didn't work.");
      return;
    }
    setPassword("");
    await resolveStage();
    setBusy(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      setBusy(false);
      toast.error("Couldn't start verification. Try again.");
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error("That code wasn't accepted. Try again.");
      setCode("");
      return;
    }
    navigate({ to: destination, replace: true });
  }

  async function startOver() {
    await supabase.auth.signOut();
    setCode("");
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setStage("password");
  }



  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="surface-panel w-full max-w-sm space-y-6 p-7">
        <div className="text-center">
          <Logo />
          <p className="mt-3 text-xs tracking-[0.2em] text-muted-foreground uppercase">
            Admin access
          </p>
        </div>

        {denied ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm text-muted-foreground">
            That account doesn't have admin access. Sign in with a Repara admin account.
          </p>
        ) : null}

        {stage === "loading" ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {stage === "password" ? (
          <form onSubmit={handlePassword} className="space-y-6">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
                required
              />
            </Field>
            <Button type="submit" size="lg" className="h-12 w-full rounded-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} CONTINUE
            </Button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className="w-full text-center text-xs text-muted-foreground underline disabled:opacity-60"
            >
              Forgot password?
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Admin accounts are created internally. There is no public signup.
            </p>
          </form>
        ) : null}

        {stage === "enroll" || stage === "verify" ? (
          <form onSubmit={handleVerify} className="space-y-6">
            {stage === "enroll" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <QrCode className="size-4" /> Scan this with your authenticator app.
                </div>
                {qrCode ? (
                  <img
                    src={qrCode}
                    alt="Authenticator app QR code"
                    className="mx-auto size-44 rounded-xl border border-border bg-white p-2"
                  />
                ) : null}
                {secret ? (
                  <p className="text-center text-[11px] break-all text-muted-foreground">
                    Can't scan? Enter this key manually: <span className="font-mono">{secret}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4" /> Enter the 6-digit code from your authenticator
                app.
              </div>
            )}
            <Field label="Authenticator code" htmlFor="code">
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-12 text-center text-lg tracking-[0.4em]"
                required
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full rounded-full"
              disabled={busy || code.length < 6}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} VERIFY
            </Button>
            <button
              type="button"
              onClick={startOver}
              className="w-full text-center text-xs text-muted-foreground underline"
            >
              Start over
            </button>
          </form>
        ) : null}

      </div>
    </div>
  );
}
