import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — Repara" },
      { name: "description", content: "Repara internal admin sign in." },
      { property: "og:title", content: "Admin Sign In — Repara" },
      { property: "og:description", content: "Repara internal admin sign in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error("Those credentials didn't work.");
      return;
    }
    navigate({ to: "/admin", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <form onSubmit={handleSubmit} className="surface-panel w-full max-w-sm space-y-6 p-7">
        <div className="text-center">
          <Logo />
          <p className="mt-3 text-xs tracking-[0.2em] text-muted-foreground uppercase">Admin access</p>
        </div>

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

        <Button type="submit" size="lg" className="h-12 w-full rounded-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} SIGN IN
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Admin accounts are created internally. There is no public signup.
        </p>
      </form>
    </div>
  );
}
