import { createFileRoute } from "@tanstack/react-router";

import { NotificationCenter } from "@/components/common/NotificationCenter";
import { ProviderShell } from "@/components/provider/ProviderShell";

export const Route = createFileRoute("/_driver/provider/notifications")({
  head: () => ({ meta: [
    { title: "Provider notifications — Repara" },
    { name: "description", content: "New requests, customer messages and accepted quotes." },
    { property: "og:title", content: "Provider notifications — Repara" },
    { property: "og:description", content: "New requests, customer messages and accepted quotes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: () => (
    <ProviderShell>
      <NotificationCenter audience="provider" />
    </ProviderShell>
  ),
});
