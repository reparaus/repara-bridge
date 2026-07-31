import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The admin landing page is the request dashboard, which now lives at
 * /admin/requests. Kept as a permanent redirect so old links keep working.
 */
export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/requests", replace: true });
  },
});
