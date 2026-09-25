import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { getRequestInvites, inviteProviders } from "@/lib/provider-quotes.functions";

/** Admin: send a request to real, active providers so they can quote it. */
export function ProviderInvites({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getRequestInvites);
  const invite = useServerFn(inviteProviders);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["request-invites", requestId], queryFn: () => load({ data: { requestId } }) });
  const [picked, setPicked] = useState<string[]>([]);

  const mut = useMutation({
    mutationFn: () => invite({ data: { requestId, providerIds: picked } }),
    onSuccess: async (r) => {
      toast.success(r.invited ? `Sent to ${r.invited} provider${r.invited > 1 ? "s" : ""}.` : "Already sent to those providers.");
      setPicked([]);
      await queryClient.invalidateQueries({ queryKey: ["request-invites", requestId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (isError || !data)
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        Couldn't load providers. <button className="text-primary" onClick={() => void refetch()}>Try again</button>
      </div>
    );

  const invited = new Map(data.invites.map((i) => [i.providerId, i.status]));
  const latest = (pid: string) =>
    data.quotes.filter((q) => q.providerId === pid).sort((a, b) => b.version - a.version)[0];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">Providers for quotes</p>
      {data.providers.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No active providers yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.providers.map((p) => {
            const status = invited.get(p.id);
            const q = latest(p.id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <label className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={Boolean(status)}
                    checked={Boolean(status) || picked.includes(p.id)}
                    onChange={(e) => setPicked((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))}
                  />
                  <span className="truncate">{p.name}</span>
                  {p.area && <span className="truncate text-xs text-muted-foreground">{p.area}</span>}
                </label>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {q ? `${formatCents(q.totalCents)} v${q.version} · ${q.status}` : status ?? ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {picked.length > 0 && (
        <Button className="mt-3 h-10 w-full" disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send to {picked.length} provider{picked.length > 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}
