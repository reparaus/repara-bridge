import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Wrench, BadgeCheck, Car } from "lucide-react";

import heroVehicle from "@/assets/hero-vehicle.jpg";
import { Logo } from "@/components/brand/Logo";
import { ServiceCard } from "@/components/common/ServiceCard";
import { Reviews } from "@/components/marketing/Reviews";
import { TechnicianProfile, type Technician } from "@/components/marketing/TechnicianProfile";
import { Button } from "@/components/ui/button";
import { LANDING_SERVICE_KEYS, SERVICES } from "@/lib/services";
import { siteConfig } from "@/lib/site-config";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Repara — Toyota & Lexus Service, Dealer-Level Care" },
      {
        name: "description",
        content:
          "Toyota & Lexus service backed by dealership experience, with transparent pricing and a simpler way to get your car serviced. Request a quote in under a minute.",
      },
      { property: "og:title", content: "Repara — Toyota & Lexus Service, Dealer-Level Care" },
      {
        property: "og:description",
        content:
          "Dealership-trained, ASE Certified service with transparent pricing and direct communication.",
      },
    ],
  }),
  component: Landing,
});

const STEPS = [
  { n: "01", title: "Tell Us What You Drive", copy: "Year, make and model — or your VIN." },
  { n: "02", title: "Choose What You Need", copy: "A few quick questions, no jargon." },
  { n: "03", title: "Get Your Quote", copy: "Parts, labor and fees, itemized." },
  { n: "04", title: "Approve & Schedule", copy: "Approve online. Nothing extra without you." },
];

const TRUST_INDICATORS = [
  { icon: Wrench, value: "5 Years", label: "Dealer Experience" },
  { icon: BadgeCheck, value: "ASE Certified", label: "Technician" },
  { icon: Car, value: "Toyota & Lexus", label: "Specialized" },
];

const WHY = [
  {
    title: "Dealer Experience",
    copy: "Trained on the same procedures and tooling dealerships use.",
  },
  {
    title: "Transparent Estimates",
    copy: "Line-item parts, labor and fees before any work begins.",
  },
  {
    title: "Personalized Service",
    copy: "Work directly with the technician servicing your vehicle.",
  },
  {
    title: "Simple Communication",
    copy: "Text, call or email — clear answers, no runaround.",
  },
];

const CARLOS: Technician = {
  name: "Carlos",
  role: "Founder • ASE Certified Automotive Technician",
  bio: "ASE Certified automotive technician with 5 years of dealership experience — 3 years with Toyota and 2 years with Lexus. I started Repara to offer the same level of care and expertise without the dealership pricing and hassle.",
  credentials: [
    { value: "ASE Certified", label: "Automotive Technician" },
    { value: "3 Years", label: "Toyota Experience" },
    { value: "2 Years", label: "Lexus Experience" },
  ],
};

function Landing() {
  useEffect(() => {
    track("landing_view");
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5">
          <Logo />
          <nav className="flex items-center gap-5 sm:gap-6">
            <a
              href="#services"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Services
            </a>
            <a
              href="#how"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              How it works
            </a>
            <Button asChild size="sm" className="rounded-full px-5 tracking-wide">
              <Link to="/quote" onClick={() => track("quote_started", { source: "nav" })}>
                Get a Quote
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
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
              Specializing in Toyota &amp; Lexus
            </p>
            <h1 className="mt-4 max-w-2xl font-display text-[2.1rem] leading-[1.06] font-extrabold sm:text-6xl">
              Dealer-Level Care.
              <span className="block chrome-text">Without Dealer Prices.</span>
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
              Toyota &amp; Lexus service backed by dealership experience, with transparent pricing
              and a simpler way to get your car serviced.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-13 rounded-full px-8 text-sm tracking-[0.12em]">
                <Link to="/quote" onClick={() => track("quote_started", { source: "hero" })}>
                  GET A QUOTE <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 rounded-full border-border bg-transparent px-8 text-sm tracking-[0.12em]"
              >
                <a href="#services">VIEW SERVICES</a>
              </Button>
            </div>

            <ul className="mt-9 grid max-w-2xl grid-cols-1 gap-2.5 sm:mt-10 sm:grid-cols-3 sm:gap-3">
              {TRUST_INDICATORS.map(({ icon: Icon, value, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface/70 px-4 py-3 backdrop-blur hairline-top"
                >
                  <Icon className="size-4 shrink-0 text-chrome" aria-hidden />
                  <span className="min-w-0 leading-tight">
                    <span className="block text-sm font-semibold">{value}</span>
                    <span className="block text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                      {label}
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
              How it works
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  className="rounded-xl border border-light-border bg-light-foreground/[0.03] p-5"
                >
                  <span className="font-display text-sm tracking-[0.2em] text-light-muted">
                    {s.n}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-light-foreground sm:text-lg">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-light-muted">{s.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-5">
            <SectionLabel>Services</SectionLabel>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Tap a service to start your quote. Pricing is quoted per vehicle and per job — you'll
              see the full breakdown before you approve anything.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LANDING_SERVICE_KEYS.map((key) => {
                const service = SERVICES.find((s) => s.key === key)!;
                return (
                  <ServiceCard
                    key={key}
                    label={service.label}
                    blurb={service.blurb}
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
            <SectionLabel>Why Repara</SectionLabel>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
              {WHY.map((w) => (
                <div key={w.title} className="elevated-panel p-5 sm:p-6">
                  <h3 className="text-base font-semibold sm:text-lg">{w.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{w.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* MEET YOUR TECHNICIAN */}
        <section className="border-t border-border py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-5">
            <SectionLabel>Meet Your Technician</SectionLabel>
            <div className="mt-6">
              <TechnicianProfile technician={CARLOS} />
            </div>

            <div className="mt-8 flex flex-col items-start gap-4 rounded-xl border border-border bg-surface/60 p-5 hairline-top sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="font-display text-lg font-semibold">
                Have a Toyota or Lexus that needs service?
              </p>
              <Button
                asChild
                size="lg"
                className="h-12 w-full shrink-0 rounded-full px-7 text-sm tracking-[0.12em] sm:w-auto"
              >
                <Link to="/quote" onClick={() => track("quote_started", { source: "technician" })}>
                  GET A QUOTE
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
              Ready for Better Car Care?
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Professional service. Straightforward pricing. No runaround.
            </p>
            <Button asChild size="lg" className="mt-6 h-13 rounded-full px-9 text-sm tracking-[0.12em]">
              <Link to="/quote" onClick={() => track("quote_started", { source: "footer_cta" })}>
                GET YOUR QUOTE
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <Logo compact />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Repara. Independent service provider. Not affiliated with
            Toyota or Lexus.
          </p>
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
