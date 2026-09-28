import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";

export const SUPPORT_EMAIL = "support@reparaus.com";

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      <Link to="/privacy-policy" className="underline underline-offset-2 hover:text-foreground">
        Privacy Policy
      </Link>
      {" · "}
      <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
        Terms &amp; Conditions
      </Link>
    </span>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" aria-label="Repara home"><Logo /></Link>
          <Link to="/quote" className="text-sm text-muted-foreground hover:text-foreground">Get a quote</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
        {children}
      </main>
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Repara</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
