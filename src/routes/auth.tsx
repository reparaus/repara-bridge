import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy admin sign-in path. Kept so old links land on the MFA login screen. */
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/login", replace: true });
  },
});
