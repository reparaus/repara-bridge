import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/**
 * Consumer (driver) area gate.
 *
 * Deliberately separate from the admin `_authenticated` layout: a driver only
 * needs a signed-in account — no MFA, no admin role. A person may hold both a
 * driver account and staff roles, so nothing here excludes staff.
 */
export const Route = createFileRoute("/_driver")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/signin", search: { next: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
