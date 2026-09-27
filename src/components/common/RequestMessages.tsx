import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Conversation } from "@/components/common/Conversation";
import { Skeleton } from "@/components/ui/skeleton";
import { getConversation, sendMessage } from "@/lib/messaging.functions";

/** Signed-in conversation for one (request, provider) pair. */
export function RequestMessages({
  requestId,
  providerId,
  viewer,
  otherName,
}: {
  requestId: string;
  providerId: string;
  viewer: "customer" | "provider";
  otherName: string;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getConversation);
  const send = useServerFn(sendMessage);
  const key = ["conversation", requestId, providerId];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { requestId, providerId } }),
    refetchInterval: 20_000,
  });
  const mut = useMutation({
    mutationFn: (body: string) => send({ data: { requestId, providerId, body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (isError)
    return (
      <p className="rounded-2xl border border-border/60 bg-card p-4 text-sm">
        Messages couldn't load. <button className="text-primary" onClick={() => void refetch()}>Try again</button>
      </p>
    );
  return (
    <Conversation
      messages={data?.messages ?? []}
      viewer={viewer}
      otherName={otherName}
      sending={mut.isPending}
      onSend={(body) => mut.mutateAsync(body)}
    />
  );
}
