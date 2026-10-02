import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Globe, Mail, MapPin, Phone } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getProviderPublicFn } from "@/lib/provider.functions";
import { providerKindLabel } from "@/lib/provider-kinds";
import { requestServiceKeyFor, serviceCategoryLabel } from "@/lib/service-network";
import { isServiceKey } from "@/lib/services";

/**
 * Customer-facing provider profile. Public on purpose (shareable link), and it
 * shows ONLY what the provider supplied: no ratings, reviews, certifications,
 * years of experience, pricing, availability or ranking language exists here.
 */
export const Route = createFileRoute("/providers/$id")({
  validateSearch: (search: Record<string, unknown>): { v?: string } =>
    typeof search.v === "string" ? { v: search.v } : {},
  head: () => ({
    meta: [
      { title: "Repara provider" },
      {
        name: "description",
        content: "An automotive service provider on Repara: the services they offer, where they work and how to request service.",
      },
      { property: "og:title", content: "Repara provider" },
      {
        property: "og:description",
        content: "Request service from a provider on Repara — your vehicle details come along automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicProviderProfile,
});

const DAY_LABEL: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function PublicProviderProfile() {
  const { id } = Route.useParams();
  const { v: vehicleId } = Route.useSearch();
  const load = useServerFn(getProviderPublicFn);
  const { data, isLoading } = useQuery({
    queryKey: ["public-provider", id],
    queryFn: () => load({ data: { id } }),
  });

  const provider = data?.provider ?? null;

  const hours = provider
    ? Object.entries(provider.hours).filter(([, value]) => Boolean(value?.trim()))
    : [];

  const primaryCategory = provider?.categories[0];
  const serviceKey = requestServiceKeyFor(primaryCategory ?? null);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link to="/" aria-label="Repara">
            <Logo className="h-7 w-auto" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8">
        {isLoading && <Skeleton className="h-40 w-full rounded-3xl" />}

        {!isLoading && !provider && (
          <div className="rounded-3xl border border-border/70 bg-card p-8 text-center">
            <p className="text-base font-medium text-foreground">This provider page isn't available.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The profile may be paused, or the link may be out of date.
            </p>
            <Button asChild className="mt-5 h-12">
              <Link to="/quote">Request service</Link>
            </Button>
          </div>
        )}

        {provider && (
          <>
            <div className="flex items-start gap-4">
              {provider.logoUrl ? (
                <img
                  src={provider.logoUrl}
                  alt={provider.businessName}
                  className="h-16 w-16 rounded-2xl border border-border/60 object-cover"
                />
              ) : null}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {provider.businessName}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    providerKindLabel(provider.providerKind),
                    provider.offersMobile ? "Comes to you" : null,
                    provider.offersInShop ? "In-shop" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <Button asChild className="mt-6 h-12 w-full text-base sm:w-auto">
              <Link
                to="/quote"
                search={{
                  ...(isServiceKey(serviceKey) ? { service: serviceKey } : {}),
                  ...(vehicleId ? { v: vehicleId } : {}),
                  p: provider.id,
                  ...(primaryCategory ? { cat: primaryCategory } : {}),
                }}
              >
                Request service
              </Link>
            </Button>

            {provider.description && (
              <section className="mt-8">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  About
                </h2>
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-foreground">
                  {provider.description}
                </p>
              </section>
            )}

            {provider.categories.length > 0 && (
              <section className="mt-8">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Services
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {provider.categories.map((key) => (
                    <span
                      key={key}
                      className="rounded-full bg-secondary px-3 py-1.5 text-sm text-foreground"
                    >
                      {serviceCategoryLabel(key, "en") ?? key}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {provider.laborRateCents ? (
              <section className="mt-8">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Labor rate
                </h2>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  ${(provider.laborRateCents / 100).toFixed(provider.laborRateCents % 100 ? 2 : 0)}
                  <span className="text-base font-normal text-muted-foreground">/hr</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Standard labor rate. Final pricing depends on the vehicle, parts, and work required.
                </p>
              </section>
            ) : null}

            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Service area
              </h2>
              <div className="mt-3 space-y-2 text-sm text-foreground">
                {(provider.city || provider.region || provider.postalCode) && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {[provider.city, provider.region, provider.postalCode].filter(Boolean).join(", ")}
                  </p>
                )}
                {provider.offersMobile && provider.serviceRadiusMiles ? (
                  <p className="text-muted-foreground">
                    Mobile service · Travels up to {provider.serviceRadiusMiles} miles
                  </p>
                ) : null}
                {provider.areas.length > 0 && (
                  <p className="text-muted-foreground">
                    ZIP codes: {provider.areas.map((area) => area.postalCode).filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            </section>

            {(provider.phone || provider.email || provider.website) && (
              <section className="mt-8">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Contact
                </h2>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  {provider.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {provider.phone}
                    </p>
                  )}
                  {provider.email && (
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {provider.email}
                    </p>
                  )}
                  {provider.website && (
                    <p className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <a
                        href={provider.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline"
                      >
                        {provider.website}
                      </a>
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Hours appear only when the provider actually configured them. */}
            {hours.length > 0 && (
              <section className="mt-8">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Hours
                </h2>
                <div className="mt-3 space-y-1 text-sm text-foreground">
                  {hours.map(([day, value]) => (
                    <p key={day} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{DAY_LABEL[day] ?? day}</span>
                      <span>{value}</span>
                    </p>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
