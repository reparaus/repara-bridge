import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/login")({
  validateSearch: z.object({ denied: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Admin Sign In — Repara" },
      { name: "description", content: "Repara internal admin sign in with phone multi-factor auth." },
      { property: "og:title", content: "Admin Sign In — Repara" },
      {
        property: "og:description",
        content: "Repara internal admin sign in with phone multi-factor auth.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLoginPage,
});

type Stage = "loading" | "password" | "enroll" | "enroll-verify" | "challenge";

function AdminLoginPage() {
  const navigate = useNavigate();
  const { denied } = Route.useSearch();

  const [stage, setStage] = useState<Stage>("loading");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  /** Decides what the admin has to do next based on session + MFA state. */
  const resolveStage = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setStage("password");
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      navigate({ to: "/admin", replace: true });
      return;
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.phone ?? []).find((f) => f.status === "verified");

    if (!verified) {
      // Clean up any half-finished enrollment so a retry can start fresh.
      for (const f of factors?.phone ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      setStage("enroll");
      return;
    }

    setFactorId(verified.id);
    const { data: challenge, error } = await supabase.auth.mfa.challenge({ factorId: verified.id });
    if (error || !challenge) {
      toast.error("Couldn't send your verification code.");
      setStage("password");
      return;
    }
    setChallengeId(challenge.id);
    setStage("challenge");
  }, [navigate]);

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

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "phone",
      phone: phone.trim(),
    });
    if (error || !data) {
      setBusy(false);
      toast.error(error?.message ?? "Couldn't start phone enrollment.");
      return;
    }
    setFactorId(data.id);
    setStage("enroll-verify");
    setBusy(false);
    toast.success("We texted you a 6-digit code.");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);

    let currentChallenge = challengeId;
    if (stage === "enroll-verify" || !currentChallenge) {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error || !data) {
        setBusy(false);
        toast.error("Couldn't send your verification code.");
        return;
      }
      currentChallenge = data.id;
      setChallengeId(data.id);
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: currentChallenge,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error("That code wasn't accepted. Try again.");
      setCode("");
      return;
    }
    navigate({ to: "/admin", replace: true });
  }

  async function resend() {
    if (!factorId) return;
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error || !data) {
      toast.error("Couldn't resend the code.");
      return;
    }
    setChallengeId(data.id);
    toast.success("New code sent.");
  }

  async function startOver() {
    await supabase.auth.signOut();
    setCode("");
    setFactorId(null);
    setChallengeId(null);
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
            <p className="text-center text-xs text-muted-foreground">
              Admin accounts are created internally. There is no public signup.
            </p>
          </form>
        ) : null}

        {stage === "enroll" ? (
          <form onSubmit={handleEnroll} className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Smartphone className="size-4" /> Register a phone for two-step sign in.
            </div>
            <Field label="Phone number (e.g. +15551234567)" htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+15551234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12"
                required
              />
            </Field>
            <Button type="submit" size="lg" className="h-12 w-full rounded-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} SEND CODE
            </Button>
            <button
              type="button"
              onClick={startOver}
              className="w-full text-center text-xs text-muted-foreground underline"
            >
              Use a different account
            </button>
          </form>
        ) : null}

        {stage === "enroll-verify" || stage === "challenge" ? (
          <form onSubmit={handleVerify} className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" /> Enter the 6-digit code we texted you.
            </div>
            <Field label="Verification code" htmlFor="code">
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
            <div className="flex justify-between text-xs text-muted-foreground">
              <button type="button" onClick={resend} className="underline">
                Resend code
              </button>
              <button type="button" onClick={startOver} className="underline">
                Start over
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
