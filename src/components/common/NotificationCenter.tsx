import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyNotifications, markNotificationsRead } from "@/lib/messaging.functions";
import { cn } from "@/lib/utils";

/** Shared notification list for the driver and provider sides. */
export function NotificationCenter({ audience }: { audience: "driver" | "provider" }) {
  const qc = useQueryClient();
  const load = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationsRead);
  const key = ["notifications", audience];
  const query = useQuery({ queryKey: key, queryFn: () => load({ data: { audience } }) });
  const markMut = useMutation({
    mutationFn: (ids?: string[]) => mark({ data: { audience, ...(ids ? { ids } : {}) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["garage-home"] });
    },
  });
  const items = query.data?.notifications ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
        {unread > 0 && (
          <Button variant="outline" size="sm" disabled={markMut.isPending} onClick={() => markMut.mutate(undefined)}>
            Mark all as read
          </Button>
        )}
      </div>
      {query.isLoading && <Skeleton className="mt-6 h-40 w-full rounded-lg" />}
      {query.isError && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-foreground">Notifications could not be loaded.</p>
          <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
        </div>
      )}
      {!query.isLoading && !query.isError && items.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">No updates yet.</div>
      )}
      <div className="mt-6 divide-y divide-border border-y border-border">
        {items.map((n) => (
          <a
            key={n.id}
            href={n.link ?? undefined}
            onClick={() => {
              if (!n.readAt) markMut.mutate([n.id]);
            }}
            className={cn("flex items-start gap-3 py-4", n.link && "hover:bg-secondary/40")}
          >
            <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-muted" : "bg-primary")} aria-label={n.readAt ? "Read" : "Unread"} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm text-foreground", !n.readAt && "font-semibold")}>{n.title}</p>
              {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
            {n.link && <ChevronRight className="mt-1 size-4 text-muted-foreground" aria-hidden />}
          </a>
        ))}
      </div>
    </div>
  );
}
