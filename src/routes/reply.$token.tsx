import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MessageCircleQuestion } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getReplyContextFn, submitCustomerReplyFn } from "@/lib/reply.functions";

export const Route = createFileRoute("/reply/$token")({
  head: () => ({
    meta: [
      { title: "Answer a question — Repara" },
      {
        name: "description",
        content: "Answer a quick question from the Repara team about your service request.",
      },
      { property: "og:title", content: "Answer a question — Repara" },
      { property: "og:description", content: "Reply to the Repara team about your service request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerReply,
});

function CustomerReply() {
  const { token } = Route.useParams();
  const getContext = useServerFn(getReplyContextFn);
  const submitReply = useServerFn(submitCustomerReplyFn);

  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["reply-context", token],
    queryFn: () => getContext({ data: { token } }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => submitReply({ data: { token, message } }),
    onSuccess: (result) => {
      if (result.ok) setSent(true);
      else setError(result.error ?? "Your reply could not be sent.");
    },
    onError: () => setError("Something went wrong. Please try again."),
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-10">
      <Logo className="h-9 w-auto self-start" />

      {isPending ? (
        <LoadingState label="Loading your question…" />
      ) : !data?.found ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="This link is no longer active"
          description="The link may have expired or already been used. Please reply to our email or give us a call and we'll pick up right where we left off."
        />
      ) : sent ? (
        <div className="rounded-2xl border bg-card p-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10">
            <Check className="size-5 text-primary" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold">Thanks — we got your answer</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A Repara technician will review it and follow up with you shortly.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-semibold">
            {data.firstName ? `Hi ${data.firstName}, one quick question` : "One quick question"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            About your request {data.requestNumber}
            {data.vehicle ? ` · ${data.vehicle}` : ""}
          </p>

          <p className="mt-5 rounded-xl bg-muted p-4 text-sm leading-relaxed">{data.question}</p>

          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              if (message.trim().length < 2) {
                setError("Please type your answer first.");
                return;
              }
              mutation.mutate();
            }}
          >
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Type your answer…"
              rows={5}
              maxLength={2000}
              aria-label="Your answer"
              required
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Send answer
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No account needed. We only use this to finish reviewing your request.
            </p>
          </form>
        </div>
      )}
    </main>
  );
}
