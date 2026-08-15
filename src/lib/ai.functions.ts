import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Repara AI admin server functions.
 *
 * Every function here is a privileged endpoint, so each one re-verifies the
 * caller itself: approved admin (public.admin_users) + a TOTP (aal2) session.
 * The route guard is UX only; this check is the security boundary.
 */

const idSchema = z.object({ id: z.string().uuid() });

async function assertVerifiedAdmin(context: {
  supabase: unknown;
  userId: string;
  claims: unknown;
}) {
  const claims = context.claims as { aal?: string } | null;
  if (claims?.aal !== "aal2") throw new Error("Two-factor verification is required.");

  const client = context.supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { role?: string } | null }> };
      };
    };
  };
  const { data } = await client.from("admin_users").select("role").eq("user_id", context.userId).maybeSingle();
  if (data?.role !== "admin") throw new Error("Admin access is required.");
}

/** Runs (or reuses) the AI intake analysis for one request. */
export const analyzeRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.extend({ force: z.boolean().default(false) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { analyzeRequest } = await import("@/lib/repara-ai.server");
    return analyzeRequest(data.id, data.force);
  });

/** Hides the AI card until the next analysis. */
export const dismissAnalysisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { dismissAnalysis } = await import("@/lib/repara-ai.server");
    return dismissAnalysis(data.id);
  });

/** Message thread for one request. */
export const listCommunicationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { listCommunications } = await import("@/lib/repara-ai.server");
    return { messages: await listCommunications(data.id) };
  });

/**
 * Sends one clarification question to the customer. Only ever called from an
 * explicit admin confirmation — the AI never triggers this itself.
 */
export const askCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    idSchema
      .extend({
        message: z.string().trim().min(5).max(1000),
        aiGenerated: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { askCustomer } = await import("@/lib/repara-ai.server");
    return askCustomer({
      requestId: data.id,
      message: data.message,
      adminId: context.userId,
      aiGenerated: data.aiGenerated,
    });
  });

/** Marks the customer reply as read. */
export const clearAdminReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertVerifiedAdmin(context);
    const { clearAdminReview } = await import("@/lib/repara-ai.server");
    return clearAdminReview(data.id);
  });
