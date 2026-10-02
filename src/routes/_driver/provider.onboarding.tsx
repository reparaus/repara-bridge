import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ProviderShell } from "@/components/provider/ProviderShell";
import {
  EMPTY_PROVIDER_FORM,
  ProviderBusinessSection,
  ProviderContactSection,
  ProviderServicesSection,
  type ProviderFormValues,
} from "@/components/provider/ProviderForm";
import { PricingSettings } from "@/components/provider/PricingSettings";
import { Button } from "@/components/ui/button";
import { getMyProviderFn, saveMyProviderFn, setMyProviderStatusFn } from "@/lib/provider.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_driver/provider/onboarding")({
  head: () => ({
    meta: [
      { title: "Become a Repara provider — Repara" },
      {
        name: "description",
        content: "Set up your provider profile: your business, your service area and the services you offer.",
      },
      { property: "og:title", content: "Become a Repara provider" },
      { property: "og:description", content: "A short guided setup — then drivers can send you requests." },
          { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderOnboarding,
});

const STEPS = [
  { title: "Your business", hint: "Tell drivers who you are." },
  { title: "Contact & service area", hint: "How drivers reach you, and where you work." },
  { title: "Services you offer", hint: "Only what you actually do." },
  { title: "Pricing & rates", hint: "Optional — used to fill in new quotes. You can change it later in Settings." },
] as const;

function ProviderOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { lang } = useI18n();
  const load = useServerFn(getMyProviderFn);
  const save = useServerFn(saveMyProviderFn);
  const setStatus = useServerFn(setMyProviderStatusFn);

  const { data } = useQuery({ queryKey: ["my-provider"], queryFn: () => load({}) });
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ProviderFormValues>(EMPTY_PROVIDER_FORM);

  // An unfinished draft is resumed rather than re-entered.
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
  }, [data?.provider]);

  const set = (patch: Partial<ProviderFormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  const mutation = useMutation({
    mutationFn: async (submit: boolean) => {
      await save({
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
          ...(values.serviceRadiusMiles
            ? { serviceRadiusMiles: Number(values.serviceRadiusMiles) }
            : {}),
          offersMobile: values.offersMobile,
          offersInShop: values.offersInShop,
          categories: values.categories,
          areaPostalCodes: values.areaPostalCodes
            .split(",")
            .map((zip) => zip.trim())
            .filter(Boolean),
          hours: values.hours,
        },
      });
      if (submit) await setStatus({ data: { action: "submit" } });
    },
    onSuccess: async (_result, submit) => {
      await queryClient.invalidateQueries({ queryKey: ["my-provider"] });
      if (submit) {
        toast.success("Profile submitted for review.");
        void navigate({ to: "/provider" });
      } else {
        toast.success("Saved.");
      }
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const canContinue =
    step === 0 ? values.businessName.trim().length > 1 : step === 2 ? values.categories.length > 0 : true;

  return (
    <ProviderShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {STEPS[step]!.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{STEPS[step]!.hint}</p>

      <div className="mt-4 flex gap-1.5">
        {STEPS.map((_s, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-secondary"}`}
          />
        ))}
      </div>

      <div className="mt-6">
        {step === 0 && <ProviderBusinessSection values={values} set={set} language={lang} />}
        {step === 1 && <ProviderContactSection values={values} set={set} language={lang} />}
        {step === 2 && <ProviderServicesSection values={values} set={set} language={lang} />}
        {step === 3 && <PricingSettings />}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {step > 0 && (
          <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            className="h-12 flex-1 text-base"
            disabled={!canContinue || mutation.isPending}
            onClick={() => {
              const next = step + 1;
              mutation.mutate(false, { onSuccess: () => setStep(next) });
            }}
          >
            Continue
          </Button>
        ) : (
          <Button
            className="h-12 flex-1 text-base"
            disabled={!canContinue || mutation.isPending}
            onClick={() => mutation.mutate(true)}
          >
            {mutation.isPending ? "Submitting…" : "Submit for review"}
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Your profile stays private until Repara reviews and activates it. You can keep editing it at any
        time.
      </p>
    </ProviderShell>
  );
}
