import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronRight } from "lucide-react";

import { GarageShell } from "@/components/garage/GarageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getGarageHome, markNotificationRead } from "@/lib/garage.functions";
import { cn } from "@/lib/utils";

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
  component: Notifications,
});

function Notifications() {
  const load = useServerFn(getGarageHome);
  const markRead = useServerFn(markNotificationRead);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["garage-home"], queryFn: () => load({}) });
  const mark = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["garage-home"] }),
  });

  return (
    <GarageShell>
      <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">Updates created by real activity on your vehicles.</p>
      {query.isLoading ? <Skeleton className="mt-6 h-40 w-full rounded-lg" /> : null}
      {query.isError ? (
        <div className="mt-6 border border-border bg-card p-5">
          <p className="text-sm text-foreground">Notifications could not be loaded.</p>
          <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
        </div>
      ) : null}
      {!query.isLoading && !query.isError && !query.data?.notifications.length ? (
        <div className="mt-6 border border-border bg-card p-5 text-sm text-muted-foreground">No updates yet.</div>
      ) : null}
      <div className="mt-6 divide-y divide-border border-y border-border">
        {query.data?.notifications.map((item) => (
          <div key={item.id} className={cn("py-4", !item.readAt && "font-medium")}>
            <div className="flex items-start gap-3">
              <span className={cn("mt-2 size-2 rounded-full", item.readAt ? "bg-muted" : "bg-primary")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{item.title}</p>
                {item.body ? <p className="mt-1 text-sm font-normal text-muted-foreground">{item.body}</p> : null}
                <p className="mt-2 text-xs font-normal text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
              {!item.readAt ? (
                <Button size="icon" variant="ghost" aria-label="Mark as read" disabled={mark.isPending} onClick={() => mark.mutate(item.id)}>
                  <Check className="size-4" />
                </Button>
              ) : item.vehicleId ? (
                <Button size="icon" variant="ghost" asChild aria-label="Open vehicle">
                  <Link to="/garage/vehicle/$id" params={{ id: item.vehicleId }}><ChevronRight className="size-4" /></Link>
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </GarageShell>
  );
}