import type { QuoteRequestInput } from "./quote-schema";

/** Local draft persistence so a refresh never erases quote-flow progress. */

const KEY = "repara.quote.draft.v2";
const DRAFT_TTL_MS = 48 * 60 * 60 * 1000;

export type QuoteDraft = {
  step: number;
  data: Record<string, unknown>;
  /** Last meaningful change, used to expire abandoned browser-only drafts. */
  updatedAt?: number;
};

export function loadDraft(): QuoteDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as QuoteDraft;
    if (!draft?.data || typeof draft.data !== "object") {
      window.localStorage.removeItem(KEY);
      return null;
    }
    // Legacy drafts have no timestamp. Keep them once so the customer gets the
    // new continue/start-over choice; the next save upgrades them in place.
    if (draft.updatedAt && Date.now() - draft.updatedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: QuoteDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch {
    /* storage may be unavailable (private mode) — never block the flow */
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem("repara.quote.draft.v1");
  } catch {
    /* noop */
  }
}

export type { QuoteRequestInput };
