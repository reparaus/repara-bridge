/**
 * Rate limits backed by public.consume_rate_limit (0030), so web and any
 * future native client share the same counters. SERVER ONLY.
 *
 * Visitors are identified by a salted hash of their IP; raw IPs are never
 * stored. A database error fails OPEN (the action is allowed and logged):
 * these limits protect cost and storage, and must never take the product down.
 */

import { createHash } from "node:crypto";

export const LIMITS = {
  intakeQuestions: { max: 15, windowSeconds: 3600 },
  intakeSummary: { max: 10, windowSeconds: 3600 },
  askRepara: { max: 40, windowSeconds: 86400 },
  photoUploads: { max: 24, windowSeconds: 3600 },
  /** Hard daily ceiling across every AI feature — the cost cap. */
  aiGlobal: { max: 3000, windowSeconds: 86400 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Returns true when the action is allowed (and counts it). */
export async function consumeRateLimit(name: LimitName, subject: string): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("consume_rate_limit", { _key: `${name}:${subject}`, _max: max, _window_seconds: windowSeconds });
    if (error) {
      console.error("[rate-limit] check failed, allowing", name, error.message);
      return true;
    }
    return data !== false;
  } catch (error) {
    console.error("[rate-limit] check failed, allowing", name, (error as Error)?.name ?? "Error");
    return true;
  }
}

/** Salted hash of the caller's IP for the current request. */
export async function visitorKey(): Promise<string> {
  let ip = "unknown";
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const headers = getRequest().headers;
    ip =
      headers.get("cf-connecting-ip") ||
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      "unknown";
  } catch {
    // Outside a request (tests, scripts): every caller shares one bucket.
  }
  const salt = process.env["RATE_LIMIT_SALT"] || "repara-rate-limit";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
