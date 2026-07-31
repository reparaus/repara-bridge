import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/card")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
