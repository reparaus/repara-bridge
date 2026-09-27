import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ConversationMessage = {
  id: string;
  senderRole: "customer" | "provider" | "admin";
  body: string;
  createdAt: string;
};

/**
 * Request-specific conversation (customer ↔ one provider). Presentation only:
 * loading, sending and authorization live in server functions.
 */
export function Conversation({
  messages,
  viewer,
  otherName,
  onSend,
  sending,
  disabled,
  placeholder = "Type a message…",
}: {
  messages: ConversationMessage[];
  viewer: "customer" | "provider";
  otherName: string;
  onSend: (body: string) => Promise<unknown>;
  sending: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    try {
      await onSend(body);
      setText("");
    } catch {
      /* caller shows the error; keep the draft */
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="max-h-96 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet. Questions about this request go here.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderRole === viewer;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  {!mine && <p className="mb-0.5 text-[11px] font-medium opacity-70">{otherName}</p>}
                  <p className="whitespace-pre-line break-words">{m.body}</p>
                  <p className="mt-1 text-[10px] opacity-70">{new Date(m.createdAt).toLocaleString()}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      {!disabled && (
        <form
          className="flex items-end gap-2 border-t border-border/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Textarea
            rows={1}
            maxLength={2000}
            value={text}
            placeholder={placeholder}
            className="min-h-11 resize-none"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={sending || !text.trim()} aria-label="Send">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}
