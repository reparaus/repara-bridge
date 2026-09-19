import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GarageShell, SectionTitle } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { getGarageHome, saveProfile } from "@/lib/garage.functions";

export const Route = createFileRoute("/_driver/garage/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Repara" },
      {
        name: "description",
        content: "Your contact details, preferred language, notification choices and Repara garage settings.",
      },
      { property: "og:title", content: "Profile — Repara" },
      { property: "og:description", content: "Manage your Repara account and garage." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getGarageHome);
  const save = useServerFn(saveProfile);
  const { data, isLoading } = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });

  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", language: "en" as "en" | "es" });
  const [notifications, setNotifications] = useState({
    maintenance: true,
    recalls: true,
    service_updates: true,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      firstName: data.profile.firstName ?? "",
      lastName: data.profile.lastName ?? "",
      phone: data.profile.phone ?? "",
      language: data.profile.preferredLanguage === "es" ? "es" : "en",
    });
    setNotifications({
      maintenance: data.profile.notificationPreferences?.['maintenance'] !== false,
      recalls: data.profile.notificationPreferences?.['recalls'] !== false,
      service_updates: data.profile.notificationPreferences?.['service_updates'] !== false,
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          preferredLanguage: form.language,
          notificationPreferences: notifications,
        },
      }),
    onSuccess: async () => {
      toast.success("Saved.");
      await queryClient.invalidateQueries({ queryKey: ["garage-home"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (isLoading || !data) {
    return (
      <GarageShell>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </GarageShell>
    );
  }

  return (
    <GarageShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {data.profile.firstName || "Your profile"}
      </h1>

      <div className="mt-8 space-y-8">
        <section>
          <SectionTitle>Account</SectionTitle>
          <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="h-12"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preferred language</Label>
              <div className="flex gap-2">
                {(["en", "es"] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={form.language === option ? "secondary" : "outline"}
                    className="h-11 flex-1"
                    onClick={() => setForm({ ...form, language: option })}
                  >
                    {option === "en" ? "English" : "Español"}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Repara emails and messages you in this language.
            </p>
          </div>
        </section>

        <section>
          <SectionTitle>My garage</SectionTitle>
          <Link
            to="/garage"
            className="block rounded-2xl border border-border/70 bg-card p-5 text-sm text-foreground"
          >
            {data.vehicles.length === 1 ? "1 vehicle" : `${data.vehicles.length} vehicles`}
          </Link>
        </section>

        <section>
          <SectionTitle>Offer services</SectionTitle>
          <Link
            to="/provider"
            className="block rounded-2xl border border-border/70 bg-card p-5"
          >
            <p className="text-sm font-medium text-foreground">Become a Repara Provider</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Do automotive work yourself? Create a provider profile so drivers can send you requests.
            </p>
          </Link>
        </section>

        <section>
          <SectionTitle>Notifications</SectionTitle>
          <div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-5">
            {[
              ["maintenance", "Maintenance reminders"],
              ["recalls", "Recall information"],
              ["service_updates", "Service updates"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-4">
                <span className="text-sm text-foreground">{label}</span>
                <Switch
                  checked={notifications[key as keyof typeof notifications]}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, [key]: checked })
                  }
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Used for the emails Repara already sends. Push notifications arrive with the Repara app.
          </p>
        </section>

        <Button className="h-12 w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Saving…" : "Save changes"}
        </Button>

        <section>
          <SectionTitle>Settings</SectionTitle>
          <Button variant="outline" className="h-12 w-full" onClick={signOut}>
            Sign out
          </Button>
        </section>
      </div>
    </GarageShell>
  );
}
