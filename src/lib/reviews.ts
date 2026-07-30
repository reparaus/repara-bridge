/**
 * Customer review data model.
 *
 * FUTURE GOOGLE BUSINESS INTEGRATION
 * ----------------------------------
 * Reviews are intentionally NOT fabricated and NOT scraped. When Repara is
 * ready to display real reviews, replace `getReviews()` with a loader backed by
 * an official source (Google Business Profile API via a server function in
 * `src/lib/*.functions.ts`, or a `reviews` table synced from that API).
 * Map the official payload onto the `CustomerReview` shape below, then flip
 * `siteConfig.showReviews` to `true` — the UI needs no other change.
 */
export interface CustomerReview {
  id: string;
  reviewer_name: string;
  /** 1–5 */
  rating: number;
  review_text: string;
  /** ISO date string */
  review_date: string;
  source: "google" | "manual";
  source_url?: string | null;
}

/** No review source is connected yet. Never return placeholder reviews here. */
export async function getReviews(): Promise<CustomerReview[]> {
  return [];
}
