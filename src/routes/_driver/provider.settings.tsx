import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { ContactChannelSettings } from "@/components/common/ContactChannelSettings";
import { EmailPreferences } from "@/components/common/EmailPreferences";
import { ServicePricing } from "@/components/provider/ServicePricing";
import { ProviderShell, ProviderStatusPill } from "@/components/provider/ProviderShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyProviderFn, setMyProviderStatusFn } from "@/lib/provider.functions";
import { PROVIDER_STATUS_LABEL } from "@/lib/provider-kinds";

export const Route = createFileRoute("/_driver/provider/settings")({
  head: () => ({
    meta: [
      { title: "Provider settings — Repara" },
      {
        name: "description",
        content: "Submit your provider profile for review, pause it, or resume it without losing your data.",
      },
      { property: "og:title", content: "Provider settings — Repara" },
      { property: "og:description", content: "Control whether drivers can see your profile." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderSettings,
});

function ProviderSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getMyProviderFn);
  const setStatus = useServerFn(setMyProviderStatusFn);
  const { data, isLoading } = useQuery({ queryKey: ["my-provider"], queryFn: () => load({}) });

  const mutation = useMutation({
    mutationFn: (action: "submit" | "pause" | "resume") => setStatus({ data: { action } }),
    onSuccess: async () => {
      toast.success("Updated.");
      await queryClient.invalidateQueries({ queryKey: ["my-provider"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  if (isLoading) {
    return (
      <ProviderShell>
        <Skeleton className="h-32 w-full rounded-2xl" />
      </ProviderShell>
    );
  }

  if (!data?.provider) {
    return (
      <ProviderShell>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          You don't have a provider profile yet.
        </div>
        <Button asChild className="mt-4 h-12 w-full sm:w-auto">
          <Link to="/provider/onboarding">Start setup</Link>
        </Button>
      </ProviderShell>
    );
  }

  const provider = data.provider;

  return (
    <ProviderShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>

      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">Profile status</p>
          <ProviderStatusPill
            status={provider.status}
            label={PROVIDER_STATUS_LABEL[provider.status] ?? provider.status}
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Only active profiles appear to drivers. Pausing hides your profile and keeps everything you
          entered.
        </p>

        <div className="mt-4 space-y-3">
          {(provider.status === "draft" || provider.status === "paused") && (
            <Button
              className="h-12 w-full"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(provider.status === "paused" ? "resume" : "submit")}
            >
              {provider.status === "paused" ? "Resume my profile" : "Submit for review"}
            </Button>
          )}
          {(provider.status === "active" || provider.status === "pending_review") && (
            <Button
              variant="outline"
              className="h-12 w-full"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("pause")}
            >
              Pause my profile
            </Button>
          )}
        </div>
      </div>

      <section className="mt-6">
        <p className="mb-2 text-sm font-medium text-foreground">Services &amp; preset pricing</p>
        <ServicePricing />
      </section>

      <section className="mt-6">
        <p className="mb-2 text-sm font-medium text-foreground">Notifications</p>
        <ContactChannelSettings audience="provider" />
        <div className="mt-3" />
        <EmailPreferences
          items={[
            ["provider_new_request", "New matching request"],
            ["provider_message", "Customer message"],
            ["provider_quote_accepted", "Quote accepted"],
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">In-app notifications are always kept. The switches above turn off individual email types.</p>
      </section>

      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
        <p className="text-sm font-medium text-foreground">Your Repara account</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The same account works as a driver too — your own vehicles stay in your garage.
        </p>
        <Button asChild variant="outline" className="mt-4 h-11 w-full">
          <Link to="/garage">Go to my garage</Link>
        </Button>
      </div>
    </ProviderShell>
  );
}
