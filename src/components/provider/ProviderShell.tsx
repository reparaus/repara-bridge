import { Link, useLocation } from "@tanstack/react-router";
import { Bell, Home, Inbox, Settings, Store, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

/**
 * Provider shell. Deliberately separate from both the consumer Garage and the
 * admin dashboard: a provider sees only their own business, and the same person
 * can still be a driver (Garage) and a provider with one account.
 */
const TABS = [
  { to: "/provider", label: "Home", icon: Home },
  { to: "/provider/requests", label: "Requests", icon: Inbox },
  { to: "/provider/customers", label: "Customers", icon: Users },
  { to: "/provider/profile", label: "Profile", icon: Store },
  { to: "/provider/settings", label: "Settings", icon: Settings },
] as const;

export function ProviderShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/provider" aria-label="Repara for providers" className="flex items-center gap-2">
            <Logo className="h-7 w-auto" />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              For providers
            </span>
          </Link>
          <Link
            to="/provider/notifications"
            aria-label="Notifications"
            className="ml-auto mr-2 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground sm:ml-0"
          >
            <Bell className="size-5" />
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

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/90 backdrop-blur-xl sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium",
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

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paused: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function ProviderStatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_TONE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
