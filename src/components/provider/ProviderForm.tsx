import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PROVIDER_KINDS } from "@/lib/provider-kinds";
import { groupedCategories } from "@/lib/service-network";
import { cn } from "@/lib/utils";

export type ProviderFormValues = {
  businessName: string;
  providerKind: string;
  description: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  city: string;
  region: string;
  postalCode: string;
  serviceRadiusMiles: string;
  offersMobile: boolean;
  offersInShop: boolean;
  categories: string[];
  areaPostalCodes: string;
  hours: Record<string, string>;
};

export const EMPTY_PROVIDER_FORM: ProviderFormValues = {
  businessName: "",
  providerKind: "independent_shop",
  description: "",
  phone: "",
  email: "",
  website: "",
  logoUrl: "",
  city: "",
  region: "",
  postalCode: "",
  serviceRadiusMiles: "",
  offersMobile: false,
  offersInShop: true,
  categories: [],
  areaPostalCodes: "",
  hours: {},
};

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;

type SectionProps = {
  values: ProviderFormValues;
  set: (patch: Partial<ProviderFormValues>) => void;
  language?: string;
};

/** Step 1 — who the business is. */
export function ProviderBusinessSection({ values, set, language = "en" }: SectionProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          value={values.businessName}
          onChange={(e) => set({ businessName: e.target.value })}
          placeholder="Your shop or business name"
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label>What kind of provider are you?</Label>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDER_KINDS.map((kind) => (
            <button
              key={kind.key}
              type="button"
              onClick={() => set({ providerKind: kind.key })}
              className={cn(
                "min-h-[52px] rounded-2xl border px-3 py-2 text-left text-sm transition-colors",
                values.providerKind === kind.key
                  ? "border-primary bg-secondary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {language === "es" ? kind.es : kind.en}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Tell drivers about your work</Label>
        <textarea
          id="description"
          rows={4}
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="What you do, what you specialize in, how you work."
          className="w-full rounded-2xl border border-input bg-background p-4 text-base"
        />
        <p className="text-xs text-muted-foreground">
          This is shown exactly as you write it. Repara never rewrites or translates it for you.
        </p>
      </div>
    </div>
  );
}

/** Step 2 — how a driver reaches you, and where you work. */
export function ProviderContactSection({ values, set }: SectionProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={values.phone}
            onChange={(e) => set({ phone: e.target.value })}
            inputMode="tel"
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={values.email}
            onChange={(e) => set({ email: e.target.value })}
            inputMode="email"
            className="h-12 text-base"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">Website (optional)</Label>
        <Input
          id="website"
          value={values.website}
          onChange={(e) => set({ website: e.target.value })}
          placeholder="https://"
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="logoUrl">Logo or photo link (optional)</Label>
        <Input
          id="logoUrl"
          value={values.logoUrl}
          onChange={(e) => set({ logoUrl: e.target.value })}
          placeholder="https://"
          className="h-12 text-base"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={values.city}
            onChange={(e) => set({ city: e.target.value })}
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">State</Label>
          <Input
            id="region"
            value={values.region}
            onChange={(e) => set({ region: e.target.value })}
            maxLength={4}
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postalCode">ZIP</Label>
          <Input
            id="postalCode"
            value={values.postalCode}
            onChange={(e) => set({ postalCode: e.target.value })}
            inputMode="numeric"
            className="h-12 text-base"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">I go to the vehicle</p>
            <p className="text-xs text-muted-foreground">Mobile service</p>
          </div>
          <Switch
            checked={values.offersMobile}
            onCheckedChange={(checked) => set({ offersMobile: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-3">
          <div>
            <p className="text-sm font-medium text-foreground">Drivers come to me</p>
            <p className="text-xs text-muted-foreground">In-shop service</p>
          </div>
          <Switch
            checked={values.offersInShop}
            onCheckedChange={(checked) => set({ offersInShop: checked })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="radius">How far do you travel? (miles)</Label>
          <Input
            id="radius"
            value={values.serviceRadiusMiles}
            onChange={(e) => set({ serviceRadiusMiles: e.target.value.replace(/\D/g, "") })}
            inputMode="numeric"
            className="h-12 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zips">ZIP codes you cover (optional)</Label>
          <Input
            id="zips"
            value={values.areaPostalCodes}
            onChange={(e) => set({ areaPostalCodes: e.target.value })}
            placeholder="90601, 90605, 90660"
            className="h-12 text-base"
          />
        </div>
      </div>
    </div>
  );
}

/** Step 3 — the services you actually offer, from Repara's shared list. */
export function ProviderServicesSection({ values, set, language = "en" }: SectionProps) {
  const groups = groupedCategories(language);

  function toggle(key: string) {
    set({
      categories: values.categories.includes(key)
        ? values.categories.filter((k) => k !== key)
        : [...values.categories, key],
    });
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {group.categories.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => toggle(category.key)}
                className={cn(
                  "min-h-[52px] rounded-2xl border px-3 py-2 text-left text-sm transition-colors",
                  values.categories.includes(category.key)
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Only pick what you actually do. Repara shows your services exactly as selected — nothing is
        assumed on your behalf.
      </p>
    </div>
  );
}

/** Optional hours. Left blank means Repara shows no hours at all. */
export function ProviderHoursSection({ values, set }: SectionProps) {
  const [open, setOpen] = useState(Object.keys(values.hours).length > 0);

  if (!open) {
    return (
      <Button variant="outline" className="h-12 w-full" onClick={() => setOpen(true)}>
        + Add opening hours
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {DAYS.map(([key, label]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
          <Input
            value={values.hours[key] ?? ""}
            onChange={(e) => set({ hours: { ...values.hours, [key]: e.target.value } })}
            placeholder="8:00 AM – 5:00 PM"
            className="h-11 text-base"
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Days you leave blank simply aren't shown. Repara never invents availability.
      </p>
    </div>
  );
}
