import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getAdminContext } from "@/lib/admin.functions";
import { canAccessProviderRequestFn } from "@/lib/provider.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Preserve the intended admin destination so email deep links survive login.
    const next = location.href.startsWith("/admin") ? location.href : undefined;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/admin/login", search: { next } });

    // First factor only (aal1) → finish TOTP MFA on the login screen.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") throw redirect({ to: "/admin/login", search: { next } });

    // Signed in with MFA is still not enough: the account must be an approved
    // admin (public.admin_users). RLS enforces data access on top of this.
    let isAdmin = false;
    try {
      const result = await getAdminContext();
      isAdmin = result.isAdmin;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) {
      const providerMatch = location.pathname.match(/^\/admin\/requests\/([0-9a-f-]{36})$/i);
      const providerAccess = providerMatch?.[1]
        ? await canAccessProviderRequestFn({ data: { requestId: providerMatch[1] } }).catch(() => ({ allowed: false }))
        : { allowed: false };
      if (!providerAccess.allowed)
        throw redirect({ to: "/admin/login", search: { denied: true, next } });
      return { user: data.user, isAdmin: false, isProvider: true };
    }

    return { user: data.user, isAdmin, isProvider: false };
  },
  component: () => <Outlet />,
});
