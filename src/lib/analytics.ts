/**
 * Analytics wrapper.
 *
 * Provider-agnostic on purpose. To connect a real provider later
 * (PostHog, Segment, GA4, Amplitude...), implement `AnalyticsProvider`
 * and pass it to `setAnalyticsProvider()` once at app start.
 */

export type AnalyticsEvent =
  | "landing_view"
  | "quote_started"
  | "garage_started"
  | "vehicle_added"
  | "vin_entered"
  | "vin_decoded"
  | "service_selected"
  | "vehicle_completed"
  | "details_completed"
  | "contact_started"
  | "quote_form_completed"
  | "intake_questions_shown"
  | "intake_questions_answered"
  | "quote_submitted"
  | "public_quote_viewed"
  | "quote_accepted"
  | "quote_declined"
  | "admin_quote_sent";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsProvider {
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
  identify?(id: string, props?: AnalyticsProps): void;
}

let provider: AnalyticsProvider | null = null;

export function setAnalyticsProvider(next: AnalyticsProvider | null) {
  provider = next;
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps) {
  try {
    provider?.track(event, props);
    if (import.meta.env.DEV) console.debug("[analytics]", event, props ?? {});
  } catch {
    /* analytics must never break the app */
  }
}

export function identify(id: string, props?: AnalyticsProps) {
  try {
    provider?.identify?.(id, props);
  } catch {
    /* noop */
  }
}
