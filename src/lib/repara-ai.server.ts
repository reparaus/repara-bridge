/**
 * Repara AI (Phase 1) — server-only implementation.
 *
 * Intake analysis + the admin-controlled clarification workflow. Every database
 * write happens here with the privileged server client, and the AI key never
 * leaves the server: the browser only ever calls the server functions in
 * `ai.functions.ts` / `reply.functions.ts`.
 *
 * Nothing in this file sends a customer message on its own — `askCustomer` is
 * only reached after an admin explicitly confirms the (editable) question.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type AiAnalysis = {
  summary: string;
  needs_clarification: boolean;
  ready_to_quote: boolean;
  clarification_question: string;
  recommended_services: { service: string; reason: string }[];
  internal_notes: string;
  confidence: number;
};

const SYSTEM_PROMPT = `You are an experienced automotive service intake assistant for Repara, a mobile mechanic service. You review a customer's submitted service request and prepare it for a human admin.

Rules:
- Never claim a diagnosis with certainty from a customer description. For ambiguous complaints (noises, leaks, warning lights) recommend a diagnostic evaluation instead of naming a failed part as fact.
- Never invent details that were not provided. If information is missing, say it is missing.
- Never give safety assurances, never price anything, never write anything that reads as an approval or as a confirmed repair need.
- For maintenance requests you may suggest service categories based on mileage and stated history, but label them clearly as recommendations to verify, not confirmed needs.
- summary and internal_notes are for the admin. clarification_question is the ONLY customer-facing text: one short, plain, friendly question (at most two closely related points in one sentence).
- Set ready_to_quote true only when the request has enough concrete information to price the work without guessing.
- confidence is your confidence in this assessment, between 0 and 1.

Reply with ONLY a json object of this exact shape:
{"summary":string,"needs_clarification":boolean,"ready_to_quote":boolean,"clarification_question":string,"recommended_services":[{"service":string,"reason":string}],"internal_notes":string,"confidence":number}`;

/** Columns needed for the request page; kept in one place. */
const AI_COLUMNS =
  "ai_summary, ai_needs_clarification, ai_clarification_question, ai_recommended_services, ai_internal_notes, ai_confidence, ai_ready_to_quote, ai_analyzed_at, ai_dismissed_at, needs_admin_review, last_customer_reply_at";

type Row = Record<string, any>;

function siteUrl() {
  return (process.env.REPARA_SITE_URL || "https://reparaus.com").replace(/\/$/, "");
}

/** Only intake-relevant fields are turned into prompt text. */
function buildFacts(r: Row): string {
  const v = r['vehicles'] ?? {};
  const services = Array.isArray(r['services'])
    ? (r['services'] as Row[]).map((s) => {
        const label = typeof s === "string" ? s : s?.['label'] || s?.['key'];
        const answers = s && typeof s === "object" ? s['answers'] : null;
        const detail = answers
          ? Object.values(answers as Record<string, unknown>)
              .flatMap((x) => (Array.isArray(x) ? x : [x]))
              .map((x) => String(x ?? "").trim())
              .filter(Boolean)
              .join(", ")
          : "";
        return detail ? `${label} (${detail})` : String(label ?? "");
      })
    : [];

  const mileage = r['mileage'] ?? v['mileage'];

  return [
    ["Vehicle", [v['year'], v['make'], v['model'], v['trim']].filter(Boolean).join(" ") || "not provided"],
    [
      "Engine",
      [
        v['engine_displacement'] ? `${v['engine_displacement']}L` : null,
        v['cylinder_count'] ? `${v['cylinder_count']}-cyl` : null,
        v['fuel_type'],
        v['is_hybrid'] ? "hybrid" : null,
        v['engine_code'],
      ]
        .filter(Boolean)
        .join(" ") || "not provided",
    ],
    ["Drivetrain", v['drivetrain'] && v['drivetrain'] !== "unknown" ? String(v['drivetrain']) : "not provided"],
    ["VIN", v['vin'] ? "provided" : "not provided"],
    ["Mileage", mileage ? `${Number(mileage).toLocaleString("en-US")} mi` : "not provided"],
    [
      "Requested services",
      services.length ? services.join(" | ") : String(r['service_category'] ?? "not provided"),
    ],
    [
      "Customer comments",
      String(r['details']?.description ?? r['notes'] ?? "").slice(0, 1200) || "none",
    ],
    ["Location", [r['city'], r['zip_code']].filter(Boolean).join(", ") || "not provided"],
    ["Preferred contact", r['customers']?.preferred_contact_method ?? "not provided"],
  ]
    .map(([k, val]) => `${k}: ${val}`)
    .join("\n");
}

/** Validates + normalizes the model output. Anything unusable throws. */
function validateAnalysis(raw: string): AiAnalysis {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("The AI response was not valid JSON.");
  }

  const str = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
  const summary = str(parsed['summary'], 1500);
  if (!summary) throw new Error("The AI response had no summary.");

  const recommended = Array.isArray(parsed['recommended_services'])
    ? (parsed['recommended_services'] as unknown[])
        .slice(0, 8)
        .map((item) => {
          const o = (item ?? {}) as Record<string, unknown>;
          return { service: str(o['service'], 120), reason: str(o['reason'], 300) };
        })
        .filter((s) => s.service)
    : [];

  const rawConfidence = Number(parsed['confidence']);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence > 1 ? rawConfidence / 100 : rawConfidence))
    : 0;

  const needsClarification = Boolean(parsed['needs_clarification']);

  return {
    summary,
    needs_clarification: needsClarification,
    // Readiness always loses to an open clarification request.
    ready_to_quote: Boolean(parsed['ready_to_quote']) && !needsClarification,
    clarification_question: str(parsed['clarification_question'], 600),
    recommended_services: recommended,
    internal_notes: str(parsed['internal_notes'], 2000),
    confidence,
  };
}

async function callModel(facts: string): Promise<AiAnalysis> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured (LOVABLE_API_KEY missing).");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: process.env.REPARA_AI_MODEL || DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this Repara service request and reply with the json object only.\n\n${facts}`,
        },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit reached — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    console.error("[repara-ai] gateway error", res.status, text.slice(0, 300));
    throw new Error("The AI service returned an error.");
  }

  let content = "";
  try {
    content = JSON.parse(text)?.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new Error("The AI service returned an unreadable response.");
  }
  return validateAnalysis(content);
}

/**
 * Analyzes one request and stores the result. Reuses the stored analysis unless
 * `force` is set (Re-analyze), so a page visit never costs a model call.
 */
export async function analyzeRequest(requestId: string, force: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("service_requests")
    .select(
      `id, status, mileage, notes, details, services, service_category, city, zip_code, ${AI_COLUMNS}, customers(preferred_contact_method), vehicles(year, make, model, trim, vin, engine_displacement, engine_code, cylinder_count, fuel_type, is_hybrid, drivetrain, mileage)`,
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error || !row) throw new Error("This request could not be found.");
  const record = row as Row;

  if (!force && record['ai_analyzed_at']) {
    return { ok: true as const, cached: true as const, analysis: toAnalysis(record) };
  }

  const analysis = await callModel(buildFacts(record));
  const analyzedAt = new Date().toISOString();

  const { error: saveError } = await supabaseAdmin
    .from("service_requests")
    .update({
      ai_summary: analysis.summary,
      ai_needs_clarification: analysis.needs_clarification,
      ai_clarification_question: analysis.clarification_question || null,
      ai_recommended_services: analysis.recommended_services,
      ai_internal_notes: analysis.internal_notes || null,
      ai_confidence: analysis.confidence,
      ai_ready_to_quote: analysis.ready_to_quote,
      ai_analyzed_at: analyzedAt,
      ai_dismissed_at: null,
    } as unknown as { status: "new" })
    .eq("id", requestId);
  if (saveError) {
    console.error("[repara-ai] save failed", saveError.message);
    throw new Error("The analysis could not be saved.");
  }

  return { ok: true as const, cached: false as const, analysis: { ...analysis, analyzedAt } };
}

function toAnalysis(record: Row) {
  return {
    summary: String(record['ai_summary'] ?? ""),
    needs_clarification: Boolean(record['ai_needs_clarification']),
    ready_to_quote: Boolean(record['ai_ready_to_quote']),
    clarification_question: String(record['ai_clarification_question'] ?? ""),
    recommended_services: Array.isArray(record['ai_recommended_services'])
      ? (record['ai_recommended_services'] as { service: string; reason: string }[])
      : [],
    internal_notes: String(record['ai_internal_notes'] ?? ""),
    confidence: Number(record['ai_confidence'] ?? 0),
    analyzedAt: record['ai_analyzed_at'] ?? null,
  };
}

/** Hides the AI card for this request until the next analysis. */
export async function dismissAnalysis(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("service_requests")
    .update({ ai_dismissed_at: new Date().toISOString() } as unknown as { status: "new" })
    .eq("id", requestId);
  return { ok: true };
}

/** Full message history for one request, newest last. */
export async function listCommunications(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("request_communications" as never)
    .select("id, direction, channel, message, status, ai_generated, error, created_at")
    .eq("service_request_id", requestId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown as Row[]).map((c) => ({
    id: String(c['id']),
    direction: String(c['direction']) as "outbound" | "inbound",
    channel: String(c['channel']) as "email" | "sms" | "web",
    message: String(c['message'] ?? ""),
    status: String(c['status'] ?? ""),
    aiGenerated: Boolean(c['ai_generated']),
    error: c['error'] ? String(c['error']) : null,
    createdAt: String(c['created_at']),
  }));
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sends ONE admin-confirmed clarification question to the customer by email and
 * records it on the request. No message is ever sent without this call, and this
 * call only happens from an explicit admin confirmation.
 */
export async function askCustomer(input: { requestId: string; message: string; adminId: string; aiGenerated: boolean }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("service_requests")
    .select("id, request_number, customers(first_name, email, preferred_contact_method), vehicles(year, make, model)")
    .eq("id", input.requestId)
    .maybeSingle();
  if (!row) throw new Error("This request could not be found.");

  const record = row as Row;
  const email = String(record['customers']?.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    // SMS is not configured, so there is no channel to fall back to.
    throw new Error("This customer has no email address on file, and SMS is not configured yet.");
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from("request_communications" as never)
    .insert({
      service_request_id: input.requestId,
      direction: "outbound",
      channel: "email",
      message: input.message,
      status: "pending",
      sent_by: input.adminId,
      ai_generated: input.aiGenerated,
    } as never)
    .select("id")
    .single();
  if (insertError || !created) throw new Error("The message could not be saved.");
  const communicationId = String((created as Row)['id']);

  // Single-purpose, revocable, expiring reply token — never a request id.
  const token = randomToken();
  await supabaseAdmin.from("request_reply_tokens" as never).insert({
    token,
    service_request_id: input.requestId,
    communication_id: communicationId,
  } as never);

  const delivery = await sendClarificationEmail({
    to: email,
    firstName: String(record['customers']?.first_name ?? "there"),
    requestNumber: String(record['request_number'] ?? ""),
    vehicle: [record['vehicles']?.year, record['vehicles']?.make, record['vehicles']?.model]
      .filter(Boolean)
      .join(" "),
    question: input.message,
    replyUrl: `${siteUrl()}/reply/${token}`,
  });

  await supabaseAdmin
    .from("request_communications" as never)
    .update({
      status: delivery.ok ? "sent" : "failed",
      error: delivery.ok ? null : delivery.error?.slice(0, 400),
    } as never)
    .eq("id", communicationId);

  if (delivery.ok) {
    await supabaseAdmin
      .from("service_requests")
      .update({ status: "contacted" } as unknown as { status: "new" })
      .eq("id", input.requestId)
      .eq("status", "new");
  }

  return { ok: delivery.ok, error: delivery.error ?? null, replyUrl: `${siteUrl()}/reply/${token}` };
}

/** Reuses the deployed Repara email function so the Resend key stays in Supabase. */
async function sendClarificationEmail(payload: {
  to: string;
  firstName: string;
  requestNumber: string;
  vehicle: string;
  question: string;
  replyUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, error: "Email service is not configured." };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-service-request-emails`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ mode: "clarification", ...payload }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
    let parsed: { ok?: boolean; error?: string } = {};
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      /* non-JSON */
    }
    return parsed.ok ? { ok: true } : { ok: false, error: parsed.error ?? "The email was rejected." };
  } catch (error) {
    return { ok: false, error: `Email service unreachable: ${(error as Error).message}` };
  }
}

/** Public reply page: resolves a token to the open question only. */
export async function getReplyContext(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: tokenRow } = await supabaseAdmin
    .from("request_reply_tokens" as never)
    .select("token, service_request_id, communication_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return { found: false as const };

  const t = tokenRow as unknown as Row;
  if (t['revoked_at']) return { found: false as const };
  if (t['expires_at'] && new Date(String(t['expires_at'])).getTime() < Date.now())
    return { found: false as const, expired: true as const };

  const { data: request } = await supabaseAdmin
    .from("service_requests")
    .select("request_number, customers(first_name), vehicles(year, make, model)")
    .eq("id", String(t['service_request_id']))
    .maybeSingle();

  const { data: comm } = await supabaseAdmin
    .from("request_communications" as never)
    .select("message, created_at")
    .eq("id", String(t['communication_id'] ?? ""))
    .maybeSingle();

  const r = (request ?? {}) as Row;
  const c = (comm ?? {}) as unknown as Row;

  // Deliberately narrow: no contact details, no other request data.
  return {
    found: true as const,
    requestNumber: String(r['request_number'] ?? ""),
    firstName: String(r['customers']?.first_name ?? ""),
    vehicle: [r['vehicles']?.year, r['vehicles']?.make, r['vehicles']?.model].filter(Boolean).join(" "),
    question: String(c['message'] ?? ""),
    askedAt: c['created_at'] ? String(c['created_at']) : null,
  };
}

/** Stores a customer reply and flags the request for admin review. */
export async function submitCustomerReply(token: string, message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: tokenRow } = await supabaseAdmin
    .from("request_reply_tokens" as never)
    .select("token, service_request_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return { ok: false as const, error: "This link is no longer valid." };

  const t = tokenRow as unknown as Row;
  if (t['revoked_at']) return { ok: false as const, error: "This link is no longer valid." };
  if (t['expires_at'] && new Date(String(t['expires_at'])).getTime() < Date.now())
    return { ok: false as const, error: "This link has expired — please call or email us instead." };

  const requestId = String(t['service_request_id']);

  const { error } = await supabaseAdmin.from("request_communications" as never).insert({
    service_request_id: requestId,
    direction: "inbound",
    channel: "web",
    message,
    status: "received",
  } as never);
  if (error) return { ok: false as const, error: "Your reply could not be saved. Please try again." };

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("request_reply_tokens" as never)
    .update({ used_at: now } as never)
    .eq("token", token);

  // Admin review flag only — no quote and no repair decision is ever automatic.
  await supabaseAdmin
    .from("service_requests")
    .update({ needs_admin_review: true, last_customer_reply_at: now } as unknown as { status: "new" })
    .eq("id", requestId);

  return { ok: true as const };
}

/** Clears the "customer replied" flag once an admin has read the thread. */
export async function clearAdminReview(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("service_requests")
    .update({ needs_admin_review: false } as unknown as { status: "new" })
    .eq("id", requestId);
  return { ok: true };
}
