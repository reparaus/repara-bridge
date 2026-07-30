import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getAdminContext } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Signed in is not enough: the admin area requires the admin role
    // (public.user_roles / has_role). RLS still enforces data access.
    let isAdmin = false;
    try {
      const result = await getAdminContext();
      isAdmin = result.isAdmin;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) throw redirect({ to: "/auth", search: { denied: true } });

    return { user: data.user, isAdmin };
  },
  component: () => <Outlet />,
});
