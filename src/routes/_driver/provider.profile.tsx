import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ProviderShell } from "@/components/provider/ProviderShell";
import {
  EMPTY_PROVIDER_FORM,
  ProviderBusinessSection,
  ProviderContactSection,
  ProviderHoursSection,
  ProviderServicesSection,
  type ProviderFormValues,
} from "@/components/provider/ProviderForm";
import { PricingSettings } from "@/components/provider/PricingSettings";
import { Button } from "@/components/ui/button";

function EditorSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
import { Skeleton } from "@/components/ui/skeleton";
import { getMyProviderFn, saveMyProviderFn } from "@/lib/provider.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_driver/provider/profile")({
  head: () => ({
    meta: [
      { title: "Edit provider profile — Repara" },
      {
        name: "description",
        content: "Update your business details, services, service area, hours and contact information.",
      },
      { property: "og:title", content: "Edit provider profile — Repara" },
      { property: "og:description", content: "You decide exactly what drivers see." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderProfileEditor,
});

function ProviderProfileEditor() {
  const queryClient = useQueryClient();
  const { lang } = useI18n();
  const load = useServerFn(getMyProviderFn);
  const save = useServerFn(saveMyProviderFn);
  const { data, isLoading } = useQuery({ queryKey: ["my-provider"], queryFn: () => load({}) });

  const [values, setValues] = useState<ProviderFormValues>(EMPTY_PROVIDER_FORM);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const provider = data?.provider;
    if (!provider) return;
    setValues({
      businessName: provider.businessName,
      providerKind: provider.providerKind,
      description: provider.description ?? "",
      phone: provider.phone ?? "",
      email: provider.email ?? "",
      website: provider.website ?? "",
      logoUrl: provider.logoUrl ?? "",
      city: provider.city ?? "",
      region: provider.region ?? "",
      postalCode: provider.postalCode ?? "",
      serviceRadiusMiles: provider.serviceRadiusMiles ? String(provider.serviceRadiusMiles) : "",
      offersMobile: provider.offersMobile,
      offersInShop: provider.offersInShop,
      categories: provider.categories,
      areaPostalCodes: provider.areas
        .map((area) => area.postalCode)
        .filter(Boolean)
        .join(", "),
      hours: provider.hours,
    });
    setDirty(false);
  }, [data?.provider]);

  const set = (patch: Partial<ProviderFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          businessName: values.businessName,
          providerKind: values.providerKind,
          description: values.description,
          phone: values.phone,
          email: values.email,
          website: values.website,
          logoUrl: values.logoUrl,
          city: values.city,
          region: values.region,
          postalCode: values.postalCode,
          ...(values.serviceRadiusMiles ? { serviceRadiusMiles: Number(values.serviceRadiusMiles) } : {}),
          offersMobile: values.offersMobile,
          offersInShop: values.offersInShop,
          categories: values.categories,
          areaPostalCodes: values.areaPostalCodes
            .split(",")
            .map((zip) => zip.trim())
            .filter(Boolean),
          hours: values.hours,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      toast.success("Profile saved.");
      await queryClient.invalidateQueries({ queryKey: ["my-provider"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  if (isLoading) {
    return (
      <ProviderShell>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </ProviderShell>
    );
  }

  if (!data?.provider) {
    return (
      <ProviderShell>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Provider profile</h1>
        <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          You don't have a provider profile yet.
        </div>
        <Button asChild className="mt-4 h-12 w-full sm:w-auto">
          <Link to="/provider/onboarding">Start setup</Link>
        </Button>
      </ProviderShell>
    );
  }

  return (
    <ProviderShell>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Edit profile</h1>
        {data.provider.status === "active" && (
          <Button asChild variant="outline" className="h-11">
            <Link to="/providers/$id" params={{ id: data.provider.id }}>
              View public page
            </Link>
          </Button>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Business information, services and service area appear on your public page. Pricing defaults
        stay private, except your standard labor rate.
      </p>

      <div className="mt-6 space-y-6">
        <EditorSection
          title="Business information"
          hint="Shown at the top of your public page."
        >
          <ProviderBusinessSection values={values} set={set} language={lang} />
          <div className="mt-5 space-y-2">
            <p className="text-sm font-medium text-foreground">Service format</p>
            <ProviderContactSection values={values} set={set} language={lang} parts={["format"]} />
          </div>
          <div className="mt-5">
            <ProviderContactSection values={values} set={set} language={lang} parts={["contact"]} />
          </div>
        </EditorSection>

        <EditorSection
          title="Services"
          hint="Shown on your public page and used to decide which requests are relevant to you."
        >
          <ProviderServicesSection values={values} set={set} language={lang} />
        </EditorSection>

        <EditorSection
          title="Service area"
          hint="Determines which customer requests can be matched to you. Shown on your public page."
        >
          <ProviderContactSection
            values={values}
            set={set}
            language={lang}
            parts={["location", "coverage"]}
          />
        </EditorSection>

        <EditorSection title="Hours (optional)" hint="Shown on your public page only when filled in.">
          <ProviderHoursSection values={values} set={set} language={lang} />
        </EditorSection>
      </div>

      <div className="sticky bottom-20 mt-6 sm:bottom-4">
        <Button
          className="h-12 w-full text-base"
          disabled={mutation.isPending || !dirty}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : dirty ? "Save profile changes" : "Profile saved"}
        </Button>
      </div>

      <div className="mt-8">
        <EditorSection
          title="Pricing & rates"
          hint="Your standard labor rate is the default on new quotes and is shown on your public page. Warranty, shop supplies and disposal defaults stay private. Saved separately."
        >
          <PricingSettings />
        </EditorSection>
      </div>
    </ProviderShell>
  );
}
