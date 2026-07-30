import { Star } from "lucide-react";

import type { CustomerReview } from "@/lib/reviews";

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * Renders real customer reviews. Renders nothing when there is no data —
 * no placeholders, no "coming soon" messaging.
 */
export function Reviews({ reviews }: { reviews: CustomerReview[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="border-t border-border py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-xs tracking-[0.28em] text-muted-foreground uppercase">
          Reviews
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <article key={r.id} className="surface-panel p-5">
              <div className="flex items-center gap-1" aria-label={`${r.rating} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={
                      i < Math.round(r.rating)
                        ? "size-3.5 fill-chrome text-chrome"
                        : "size-3.5 text-muted-foreground"
                    }
                  />
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.review_text}</p>
              <p className="mt-4 text-sm font-semibold">{r.reviewer_name}</p>
              <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {formatDate(r.review_date)}
                {r.source === "google" && " • via Google"}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
