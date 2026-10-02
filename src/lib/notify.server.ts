/**
 * Server-only notification helpers (0023).
 *
 * In-app notifications are created in the database (triggers / SQL functions).
 * Out-of-app delivery (email today, SMS later) is handed to the existing
 * `send-service-request-emails` edge function in `notify` mode, which checks
 * preferences, blocks duplicates and logs every outcome. Delivery never throws:
 * the underlying request / quote / message has already been saved.
 */
import { createHash, randomBytes } from "crypto";

export type NotifyItem =
  | { kind: "user"; notificationId: string }
  | {
      kind: "guest";
      requestId: string;
      event: "message_received" | "quote_received" | "request_status";
      ref: string;
      providerName?: string;
      totalCents?: number;
    };

export async function dispatchNotifications(items: NotifyItem[]): Promise<void> {
  const list = items.filter(Boolean);
  if (!list.length) return;
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[notify] missing Supabase env; skipped", list.length, "deliveries");
    return;
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-service-request-emails`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ mode: "notify", items: list }),
    });
    if (!res.ok) console.error(`[notify] edge function ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (error) {
    console.error("[notify] edge function unreachable", error);
  }
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type AdminDb = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

async function admin(): Promise<AdminDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminDb;
}

/** Mints a request-scoped guest link token. Only the hash is stored. */
export async function mintRequestToken(requestId: string): Promise<string | null> {
  try {
    const token = randomBytes(24).toString("base64url");
    const db = await admin();
    const { error } = await db.from("request_access_tokens").insert({ token_hash: hashToken(token), service_request_id: requestId });
    if (error) {
      console.error("[guest-link] mint failed", error.message);
      return null;
    }
    return token;
  } catch (error) {
    console.error("[guest-link] mint failed", error);
    return null;
  }
}

/** Resolves a guest token to exactly one request id, or null. */
export async function resolveRequestToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await admin();
  const hash = hashToken(token);
  const { data } = await db
    .from("request_access_tokens")
    .select("service_request_id, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  await db.from("request_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash);
  return String(data.service_request_id);
}

/** Finds the in-app notifications created for an event (by event_key). */
export async function notificationIdsFor(eventKeys: string[]): Promise<NotifyItem[]> {
  if (!eventKeys.length) return [];
  const db = await admin();
  const { data } = await db.from("notifications").select("id").in("event_key", eventKeys);
  return ((data ?? []) as { id: string }[]).map((n) => ({ kind: "user" as const, notificationId: String(n.id) }));
}

/**
 * Auto-invite (unchanged trigger point): active, non-demo providers that offer
 * the request's category AND pass the shared ZIP-distance rules in geo.ts.
 * Closest first, max 10. Never prefix matching; unknown distance never invites.
 */
async function inviteGeographicallyEligibleProviders(db: any, requestId: string): Promise<void> {
  let { data: req, error } = await db
    .from("service_requests")
    .select("id, zip_code, service_category_key, provider_distance_miles")
    .eq("id", requestId)
    .maybeSingle();
  if (error) ({ data: req, error } = await db.from("service_requests").select("id, zip_code, service_category_key").eq("id", requestId).maybeSingle());
  if (error || !req) return;
  const cat = req.service_category_key;
  if (!cat || cat === "other") return;
  const { data: rows } = await db
    .from("service_providers")
    .select("id, postal_code, service_radius_miles, offers_mobile, offers_in_shop, is_demo, provider_services!inner(category_key, is_active)")
    .eq("status", "active")
    .eq("provider_services.category_key", cat)
    .eq("provider_services.is_active", true)
    .limit(500);
  const { isProviderGeographicallyEligible } = await import("@/lib/geo/geo");
  const { getZipLookup } = await import("@/lib/geo/zip-location.server");
  const lookup = await getZipLookup();
  const picks = ((rows ?? []) as any[])
    .filter((p) => !p.is_demo)
    .map((p) => ({
      id: String(p.id),
      geo: isProviderGeographicallyEligible(
        { zip: p.postal_code, offersMobile: Boolean(p.offers_mobile), offersInShop: Boolean(p.offers_in_shop), travelRadiusMiles: p.service_radius_miles ?? null },
        req.zip_code,
        lookup,
        req.provider_distance_miles ?? null,
      ),
    }))
    .filter((p) => p.geo.eligible)
    .sort((a, b) => (a.geo.distanceMiles ?? 0) - (b.geo.distanceMiles ?? 0))
    .slice(0, 10);
  if (!picks.length) return;
  const { data: inserted, error: insErr } = await db
    .from("request_provider_invites")
    .upsert(picks.map((p) => ({ request_id: requestId, provider_id: p.id })), { onConflict: "request_id,provider_id", ignoreDuplicates: true })
    .select("id");
  if (insErr) return console.error("[match] invite failed", insErr.message);
  const n = (inserted ?? []).length;
  if (n > 0)
    await db.from("request_events").insert({ request_id: requestId, kind: "providers_invited", actor: "system", detail: { count: n } });
}

/** Auto-match providers for a new request and email the invited providers. */
export async function matchAndNotifyProviders(requestId: string): Promise<void> {
  try {
    const db = await admin();
    await inviteGeographicallyEligibleProviders(db, requestId);
    const { data } = await db
      .from("notifications")
      .select("id")
      .eq("service_request_id", requestId)
      .eq("event_type", "provider_new_request");
    await dispatchNotifications(((data ?? []) as { id: string }[]).map((n) => ({ kind: "user", notificationId: String(n.id) })));
  } catch (error) {
    console.error("[match] failed for request", requestId, error);
  }
}

/** Deliveries for a newly sent quote: account holder or guest link. */
export async function quoteSentItems(quoteId: string): Promise<NotifyItem[]> {
  const db = await admin();
  const { data: q } = await db
    .from("provider_quotes")
    .select("id, request_id, total_cents, service_requests(user_id), service_providers(business_name)")
    .eq("id", quoteId)
    .maybeSingle();
  if (!q) return [];
  if (q.service_requests?.user_id) return notificationIdsFor([`quote:${quoteId}`]);
  return [
    {
      kind: "guest",
      requestId: String(q.request_id),
      event: "quote_received",
      ref: String(q.id),
      providerName: q.service_providers?.business_name ?? undefined,
      totalCents: Number(q.total_cents),
    },
  ];
}
