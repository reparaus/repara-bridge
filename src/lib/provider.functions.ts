/**
 * Provider API — the only boundary the provider dashboard and the public
 * provider profile talk to. Authenticated calls act as the signed-in user, so
 * RLS (0016) decides what may be read or written.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  findActiveProviders,
  getMyProvider,
  getPublicProvider,
  listProviderRequests,
  profileCompletion,
  saveMyProvider,
  setMyProviderStatus,
} from "@/lib/provider/provider.server";

type Db = { from: (table: string) => any };

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const providerInput = z.object({
  businessName: z.string().trim().min(2).max(120),
  providerKind: z.string().trim().max(40),
  description: optionalText(2000),
  phone: optionalText(30),
  email: optionalText(255),
  website: optionalText(255),
  logoUrl: optionalText(500),
  city: optionalText(80),
  region: optionalText(40),
  postalCode: optionalText(12),
  serviceRadiusMiles: z.coerce.number().int().min(0).max(500).optional(),
  offersMobile: z.boolean().optional(),
  offersInShop: z.boolean().optional(),
  categories: z.array(z.string().trim().max(60)).max(40).optional(),
  areaPostalCodes: z.array(z.string().trim().max(12)).max(60).optional(),
  hours: z.record(z.string(), z.string().max(60)).optional(),
});

/** The signed-in user's provider profile plus completion guidance. */
export const getMyProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await getMyProvider(context.supabase as unknown as Db, context.userId);
    if (!profile) return { provider: null, completion: null, requests: [] };
    const requests = await listProviderRequests(context.supabase as unknown as Db, profile.id);
    return { provider: profile, completion: profileCompletion(profile), requests };
  });

/** Used by the shared Job Workspace route guard; RLS and the RPC both verify ownership. */
export const canAccessProviderRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_request_provider", {
      _request_id: data.requestId,
    });
    return { allowed: Boolean(allowed) };
  });

export const saveMyProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => providerInput.parse(data))
  .handler(async ({ data, context }) => {
    const clean = {
      ...data,
      description: data.description || undefined,
      phone: data.phone || undefined,
      email: data.email || undefined,
      website: data.website || undefined,
      logoUrl: data.logoUrl || undefined,
      city: data.city || undefined,
      region: data.region || undefined,
      postalCode: data.postalCode || undefined,
    };
    const profile = await saveMyProvider(context.supabase as unknown as Db, context.userId, clean);
    return { provider: profile, completion: profileCompletion(profile) };
  });

export const setMyProviderStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ action: z.enum(["submit", "pause", "resume"]) }).parse(data))
  .handler(async ({ data, context }) =>
    setMyProviderStatus(context.supabase as unknown as Db, context.userId, data.action),
  );

/** Active providers for the consumer Service area. Real rows only. */
export const findProvidersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ categoryKey: z.string().max(60).optional(), postalCode: z.string().max(12).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => ({
    providers: await findActiveProviders(context.supabase as unknown as Db, data),
  }));

/**
 * Public provider profile. Uses the publishable key with no session, so only
 * the narrow "active providers are public" policy applies.
 */
export const getProviderPublicFn = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const client = createClient(process.env['SUPABASE_URL']!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    return { provider: await getPublicProvider(client as unknown as Db, data.id) };
  });
