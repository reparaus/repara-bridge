import type { QuoteRequestInput } from "./quote-schema";

/** Local draft persistence so a refresh never erases quote-flow progress. */

const KEY = "repara.quote.draft.v2";

export type QuoteDraft = {
  step: number;
  data: Record<string, unknown>;
};

export function loadDraft(): QuoteDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuoteDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: QuoteDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
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
