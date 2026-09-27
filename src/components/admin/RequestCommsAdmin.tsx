import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { getRequestCommsAdmin } from "@/lib/messaging.functions";

/** Support view: notification delivery status and provider conversations. */
export function RequestCommsAdmin({ requestId }: { requestId: string }) {
  const load = useServerFn(getRequestCommsAdmin);
  const { data, isLoading } = useQuery({ queryKey: ["request-comms-admin", requestId], queryFn: () => load({ data: { requestId } }) });
  const [showMessages, setShowMessages] = useState(false);
  if (isLoading || !data) return null;
  return (
    <section className="surface-panel mt-4 space-y-3 p-5 text-sm">
      <p className="font-medium">Notifications &amp; provider messages</p>
      {data.deliveries.length === 0 ? (
        <p className="text-muted-foreground">No notification emails recorded.</p>
      ) : (
        <ul className="space-y-1">
          {data.deliveries.map((d) => (
            <li key={d.id} className="flex justify-between gap-3">
              <span>{d.eventType.replace(/_/g, " ")} · {d.audience} · {d.channel}</span>
              <span className={d.status === "failed" ? "text-destructive" : "text-muted-foreground"} title={d.error ?? undefined}>
                {d.status.replace(/_/g, " ")} · {new Date(d.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground">
        {data.messages.length} customer–provider message{data.messages.length === 1 ? "" : "s"}.{" "}
        {data.messages.length > 0 && (
          <button className="text-primary" onClick={() => setShowMessages((v) => !v)}>
            {showMessages ? "Hide" : "Show for support"}
          </button>
        )}
      </p>
      {showMessages && (
        <ul className="space-y-2">
          {data.messages.map((m) => (
            <li key={m.id} className="rounded-lg bg-secondary/50 p-2">
              <span className="text-xs text-muted-foreground">{m.senderRole} · {new Date(m.createdAt).toLocaleString()}</span>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
