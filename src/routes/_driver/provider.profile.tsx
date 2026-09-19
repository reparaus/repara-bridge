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
import { Button } from "@/components/ui/button";
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

      <div className="mt-6 space-y-8">
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Business
          </p>
          <ProviderBusinessSection values={values} set={set} language={lang} />
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Contact & service area
          </p>
          <ProviderContactSection values={values} set={set} language={lang} />
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Services
          </p>
          <ProviderServicesSection values={values} set={set} language={lang} />
        </section>

        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Hours (optional)
          </p>
          <ProviderHoursSection values={values} set={set} language={lang} />
        </section>
      </div>

      <div className="sticky bottom-20 mt-8 sm:bottom-4">
        <Button
          className="h-12 w-full text-base"
          disabled={mutation.isPending || !dirty}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      </div>
    </ProviderShell>
  );
}
