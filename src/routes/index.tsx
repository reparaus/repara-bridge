import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Wrench, BadgeCheck, Car } from "lucide-react";

import heroVehicle from "@/assets/hero-vehicle.jpg";
import { Logo } from "@/components/brand/Logo";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { ServiceCard } from "@/components/common/ServiceCard";
import { Reviews } from "@/components/marketing/Reviews";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { localizedServiceBlurb, localizedServiceLabel } from "@/lib/i18n/catalog";
import { LANDING_SERVICE_KEYS, SERVICES } from "@/lib/services";
import { siteConfig } from "@/lib/site-config";
import { track } from "@/lib/analytics";
import { LegalLinks } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Repara — Your car, understood." },
      {
        name: "description",
        content:
          "Keep your vehicle, maintenance, service history, trusted guidance, and real service requests connected in one place.",
      },
      { property: "og:title", content: "Repara — Your car, understood." },
      {
        property: "og:description",
        content:
          "A connected home for your vehicle, service history, guidance, and care.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEP_NUMBERS = ["01", "02", "03", "04"] as const;
const STEP_KEYS = [
  { title: "home.steps.s1t", copy: "home.steps.s1c" },
  { title: "home.steps.s2t", copy: "home.steps.s2c" },
  { title: "home.steps.s3t", copy: "home.steps.s3c" },
  { title: "home.steps.s4t", copy: "home.steps.s4c" },
];

const TRUST_INDICATORS = [
  { icon: Wrench, key: "years" },
  { icon: BadgeCheck, key: "ase" },
  { icon: Car, key: "brands" },
];

const WHY_KEYS = [
  { title: "home.why.w1t", copy: "home.why.w1c" },
  { title: "home.why.w2t", copy: "home.why.w2c" },
  { title: "home.why.w3t", copy: "home.why.w3c" },
  { title: "home.why.w4t", copy: "home.why.w4c" },
];

function Landing() {
  const { t, lang } = useI18n();

  useEffect(() => {
    track("landing_view");
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5">
          <Logo />
          <nav className="flex items-center gap-4 sm:gap-6">
            <a
              href="#services"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              {t("nav.services")}
            </a>
            <a
              href="#how"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              {t("nav.how")}
            </a>
            <LanguageToggle />
            <Button asChild size="sm" className="rounded-full px-5 tracking-wide">
              <Link to="/quote" onClick={() => track("quote_started", { source: "nav" })}>
                {t("nav.quote")}
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main key={lang} className="animate-in fade-in duration-300">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={heroVehicle}
              alt="Dark luxury SUV in a low-lit studio"
              width={1600}
              height={1200}
              fetchPriority="high"
              decoding="async"
              className="size-full object-cover object-center opacity-45"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/85 to-background" />
          </div>

          <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-12 sm:pt-24 sm:pb-20">
            <p className="text-[11px] tracking-[0.24em] text-chrome uppercase">
              {t("home.eyebrow")}
            </p>
            <h1 className="mt-4 max-w-2xl font-display text-[2.1rem] leading-[1.06] font-extrabold sm:text-6xl">
              {t("home.title1")}
              <span className="block chrome-text">{t("home.title2")}</span>
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
              {t("home.sub")}
            </p>

            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {t("home.garageTagline")}
            </p>

            {/* Two entry points, on purpose: a driver who wants their car
                tracked, and a guest who simply needs service right now. */}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-13 rounded-full px-8 text-sm tracking-[0.12em]"
              >
                <Link to="/garage" onClick={() => track("garage_started", { source: "hero" })}>
                  {t("home.ctaGarage")} <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 rounded-full border-border bg-transparent px-8 text-sm tracking-[0.12em]"
              >
                <Link to="/quote" onClick={() => track("quote_started", { source: "hero" })}>
                  {t("home.ctaQuote")}
                </Link>
              </Button>
            </div>

            <ul className="mt-9 grid max-w-2xl grid-cols-1 gap-2.5 sm:mt-10 sm:grid-cols-3 sm:gap-3">
              {TRUST_INDICATORS.map(({ icon: Icon, key }) => (
                <li
                  key={key}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface/70 px-4 py-3 backdrop-blur hairline-top"
                >
                  <Icon className="size-4 shrink-0 text-chrome" aria-hidden />
                  <span className="min-w-0 leading-tight">
                    <span className="block text-sm font-semibold">
                      {t(`home.trust.${key}.value`)}
                    </span>
                    <span className="block text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                      {t(`home.trust.${key}.label`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* HOW IT WORKS — the single soft off-white band on the page */}
        <section id="how" className="border-y border-border bg-light py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-xs tracking-[0.28em] text-light-muted uppercase">
              {t("home.howTitle")}
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {STEP_KEYS.map((s, i) => (
                <div
                  key={STEP_NUMBERS[i]}
                  className="rounded-xl border border-light-border bg-light-foreground/[0.03] p-5"
                >
                  <span className="font-display text-sm tracking-[0.2em] text-light-muted">
                    {STEP_NUMBERS[i]}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-light-foreground sm:text-lg">
                    {t(s.title)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-light-muted">{t(s.copy)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-5">
            <SectionLabel>{t("home.servicesTitle")}</SectionLabel>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {t("home.servicesIntro")}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LANDING_SERVICE_KEYS.map((key) => {
                const service = SERVICES.find((s) => s.key === key)!;
                return (
                  <ServiceCard
                    key={key}
                    label={localizedServiceLabel(service.key, lang)}
                    blurb={localizedServiceBlurb(service.key, lang)}
                    startingAt={service.startingAt ?? undefined}
                    quoteServiceKey={service.key}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* WHY REPARA */}
        <section className="border-t border-border bg-surface/40 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-5">
            <SectionLabel>{t("home.whyTitle")}</SectionLabel>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
              {WHY_KEYS.map((w) => (
                <div key={w.title} className="elevated-panel p-5 sm:p-6">
                  <h3 className="text-base font-semibold sm:text-lg">{t(w.title)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t(w.copy)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* REAL PROVIDERS */}
        <section className="border-t border-border py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-5">
            <SectionLabel>{t("home.providerTitle")}</SectionLabel>
            <div className="mt-6 flex flex-col items-start gap-4 border-y border-border py-6 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-display text-lg font-semibold">{t("home.providerHeading")}</p><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("home.providerCopy")}</p></div>
              <Button
                asChild
                size="lg"
                className="h-12 w-full shrink-0 rounded-full px-7 text-sm tracking-[0.12em] sm:w-auto"
              >
                <Link to="/provider/onboarding">
                  {t("home.providerCta")}
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* REVIEWS — hidden until real Google Business reviews are connected */}
        {siteConfig.showReviews && <Reviews reviews={[]} />}

        {/* FINAL CTA */}
        <section className="border-t border-border bg-surface/40 py-14 sm:py-16">
          <div className="mx-auto max-w-2xl px-5 text-center">
            <h2 className="font-display text-2xl font-extrabold sm:text-4xl">
              {t("home.finalTitle")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">{t("home.finalSub")}</p>
            <Button
              asChild
              size="lg"
              className="mt-6 h-13 rounded-full px-9 text-sm tracking-[0.12em]"
            >
              <Link to="/quote" onClick={() => track("quote_started", { source: "footer_cta" })}>
                {t("home.finalCta")}
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <Logo compact />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {t("home.footerNote")}
          </p>
          <LegalLinks className="text-xs text-muted-foreground" />
        </div>
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="font-display text-xs tracking-[0.28em] text-muted-foreground uppercase">
      {children}
    </h2>
  );
}
