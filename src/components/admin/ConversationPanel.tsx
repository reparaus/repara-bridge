import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listCommunicationsFn, sendCustomerMessageFn } from "@/lib/ai.functions";

/**
 * ONE conversation per request: confirmations, clarifications, quotes and
 * free-form admin messages all land in the same thread. Nothing is ever sent
 * without an explicit admin confirmation of the exact text.
 */
export function ConversationPanel({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const listMessages = useServerFn(listCommunicationsFn);
  const sendMessage = useServerFn(sendCustomerMessageFn);

  const [draft, setDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const messages = useQuery({
    queryKey: ["request-communications", requestId],
    queryFn: () => listMessages({ data: { id: requestId } }),
  });

  const send = useMutation({
    mutationFn: () => sendMessage({ data: { id: requestId, message: draft.trim() } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Message sent to the customer.");
        setDraft("");
      } else {
        toast.error(result.error ?? "The message could not be delivered.");
      }
      void messages.refetch();
      void queryClient.invalidateQueries({ queryKey: ["admin-request", requestId] });
    },
    onError: (e) => toast.error((e as Error).message || "The message could not be sent."),
  });

  const thread = messages.data?.messages ?? [];

  return (
    <section className="surface-panel min-w-0 space-y-4 overflow-hidden p-5">
      <h2 className="flex items-center gap-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">
        <MessageSquare className="size-4 text-primary" aria-hidden /> Conversation
      </h2>

      {messages.isPending && <p className="text-sm text-muted-foreground">Loading messages…</p>}

      {!messages.isPending && thread.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No messages yet. Anything you send appears here alongside confirmations and quotes.
        </p>
      )}

      <div className="space-y-3">
        {thread.map((m) => (
          <div
            key={m.id}
            className={
              m.direction === "inbound"
                ? "rounded-lg border border-primary/30 bg-primary/5 p-3"
                : "rounded-lg bg-muted/60 p-3"
            }
          >
            <p className="text-[11px] text-muted-foreground">
              {m.direction === "inbound" ? "Customer" : "Repara"} ·{" "}
              {new Date(m.createdAt).toLocaleString()}
              {m.direction === "outbound" && (
                <>
                  {" · "}
                  {m.status === "sent" ? (
                    <span className="text-foreground">
                      <Check className="inline size-3" aria-hidden /> sent
                    </span>
                  ) : m.status === "failed" ? (
                    <span className="text-destructive">not delivered</span>
                  ) : m.status === "not_configured" ? (
                    <span className="text-muted-foreground">SMS pending provider</span>
                  ) : (
                    m.status
                  )}
                  {m.aiGenerated ? " · AI drafted" : ""}
                </>
              )}
            </p>
            <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line">
              {m.message}
            </p>
            {m.error && <p className="mt-1 text-[11px] text-destructive">{m.error}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground">Message the customer</p>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Write a message — the customer gets a secure link to reply…"
          aria-label="Message to the customer"
        />
        <Button
          size="sm"
          disabled={send.isPending || draft.trim().length < 2}
          onClick={() => setConfirmOpen(true)}
        >
          {send.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          Send message
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this message to the customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This exact text is emailed with a secure reply link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed whitespace-pre-line">
            {draft.trim()}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate()}>Send message</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
