import { Link, useLocation } from "@tanstack/react-router";
import { Car, MessageCircle, User, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

/**
 * Consumer shell: mobile-first, calm, no shop chrome and no admin navigation.
 * The four areas mirror the future native app (Garage · Ask · Service · Profile)
 * so the same information architecture carries over.
 */
const TABS = [
  { to: "/garage", label: "Garage", icon: Car },
  { to: "/garage/ask", label: "Ask Repara", icon: MessageCircle },
  { to: "/garage/service", label: "Service", icon: Wrench },
  { to: "/garage/profile", label: "Profile", icon: User },
] as const;

export function GarageShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/garage" aria-label="Repara Garage">
            <Logo className="h-7 w-auto" />
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === tab.to
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/95 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function StatusDot({ tone }: { tone: "good" | "attention" | "unknown" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        tone === "good" && "bg-emerald-500",
        tone === "attention" && "bg-amber-500",
        tone === "unknown" && "bg-muted-foreground/50",
      )}
    />
  );
}
