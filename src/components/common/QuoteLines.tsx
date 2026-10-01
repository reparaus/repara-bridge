import { formatCents } from "@/lib/money";

type Line = { quoteId: string; kind: string; name: string; quantity: number; lineTotalCents: number };

/** Customer-facing quote lines: name, quantity, price. Never provider cost. */
export function QuoteLines({ quoteId, lines }: { quoteId: string; lines?: Line[] }) {
  const mine = (lines ?? []).filter((l) => l.quoteId === quoteId);
  if (!mine.length) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-sm">
      {mine.map((l, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="text-foreground">
            {l.name}
            {l.kind === "part" && l.quantity !== 1 ? <span className="text-muted-foreground"> × {l.quantity}</span> : null}
          </span>
          <span className="tabular-nums text-muted-foreground">{formatCents(l.lineTotalCents)}</span>
        </li>
      ))}
    </ul>
  );
}
