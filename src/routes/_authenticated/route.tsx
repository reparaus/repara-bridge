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

    // A provider may open only a request explicitly routed to their profile.
    // This does not grant access to any admin index or management screen.
    const providerMatch = location.pathname.match(/^\/admin\/requests\/([0-9a-f-]{36})$/i);
    const providerAccess = providerMatch?.[1]
      ? await canAccessProviderRequestFn({ data: { requestId: providerMatch[1] } }).catch(() => ({ allowed: false }))
      : { allowed: false };

    // Admin access still requires both the approved role and TOTP AAL2.
    let isAdmin = false;
    try {
      const result = await getAdminContext();
      isAdmin = result.isAdmin;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) {
      if (!providerAccess.allowed)
        throw redirect({ to: "/admin/login", search: { denied: true, next } });
      return { user: data.user, isAdmin: false, isProvider: true };
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") throw redirect({ to: "/admin/login", search: { next } });

    return { user: data.user, isAdmin, isProvider: false };
  },
  component: () => <Outlet />,
});
