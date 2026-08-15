import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getAdminContext } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login" });

    // First factor only (aal1) → finish TOTP MFA on the login screen.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") throw redirect({ to: "/admin/login" });

    // Signed in with MFA is still not enough: the account must be an approved
    // admin (public.admin_users). RLS enforces data access on top of this.
    let isAdmin = false;
    try {
      const result = await getAdminContext();
      isAdmin = result.isAdmin;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) throw redirect({ to: "/admin/login", search: { denied: true } });

    return { user: data.user, isAdmin };
  },
  component: () => <Outlet />,
});
