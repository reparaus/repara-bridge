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

/** Auto-match providers for a new request and email the invited providers. */
export async function matchAndNotifyProviders(requestId: string): Promise<void> {
  try {
    const db = await admin();
    const { error } = await db.rpc("match_request_providers", { _request_id: requestId, _limit: 10 });
    if (error) console.error("[match] failed", error.message);
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
