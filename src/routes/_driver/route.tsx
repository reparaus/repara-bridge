import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";
import { VehicleHeroSkeleton } from "@/components/garage/GarageSkeletons";
import { supabase } from "@/integrations/supabase/client";

/**
 * Consumer (driver) area gate.
 *
 * Deliberately separate from the admin `_authenticated` layout: a driver only
 * needs a signed-in account — no MFA, no admin role. A person may hold both a
 * driver account and staff roles, so nothing here excludes staff.
 *
 * While the session resolves, a neutral shell is shown immediately so the
 * page never flashes guest content or sits blank.
 */
export const Route = createFileRoute("/_driver")({
  ssr: false,
  pendingMs: 0,
  pendingMinMs: 0,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/signin", search: { next: location.href } });
    }
    return { user: data.user };
  },
  pendingComponent: DriverPending,
  component: () => <Outlet />,
});

function DriverPending() {
  return (
    <div className="min-h-screen bg-background" role="status" aria-label="Loading">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-5">
          <Logo className="h-7 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pt-6">
        <VehicleHeroSkeleton />
      </main>
    </div>
  );
}
