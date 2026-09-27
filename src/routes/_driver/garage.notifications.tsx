import { createFileRoute } from "@tanstack/react-router";

import { NotificationCenter } from "@/components/common/NotificationCenter";
import { GarageShell } from "@/components/garage/GarageShell";

export const Route = createFileRoute("/_driver/garage/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — Repara" },
    { name: "description", content: "Real updates about your vehicles and service requests." },
    { property: "og:title", content: "Notifications — Repara" },
    { property: "og:description", content: "Real updates about your vehicles and service requests." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: () => (
    <GarageShell>
      <NotificationCenter audience="driver" />
    </GarageShell>
  ),
});
