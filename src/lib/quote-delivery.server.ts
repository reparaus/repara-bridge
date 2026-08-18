/**
 * Quote delivery + customer messaging (SERVER ONLY).
 *
 * Everything customer-facing that leaves the admin dashboard passes through
 * here, so the conversation log is always complete and the delivery rules live
 * on the server rather than in the frontend:
 *
 *  - `deliverQuote`   — emails an admin-approved quote and logs it.
 *  - `sendCustomerMessage` — a free-form admin message with a reply link.
 *
 * SMS is architecturally present (channel = "sms"); until a provider is
 * connected the intent is recorded with status "not_configured" instead of
 * being silently dropped. Nothing here ever prices, quotes or messages on its
 * own — every call comes from an explicit admin action.
 */

type Row = Record<string, any>;

function siteUrl() {
  return (process.env.REPARA_SITE_URL || "https://reparaus.com").replace(/\/$/, "");
}

function edgeConfig() {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key =
    process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url: url ? url.replace(/\/$/, "") : "", key: key ?? "" };
}

async function callEmailFunction(payload: Record<string, unknown>) {
  const { url, key } = edgeConfig();
  if (!url || !key) return { ok: false, error: "Email service is not configured." };
  try {
    const res = await fetch(`${url}/functions/v1/send-service-request-emails`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
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

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

async function loadRequest(requestId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("service_requests")
    .select(
      "id, request_number, customers(first_name, email, phone, preferred_contact_method), vehicles(year, make, model)",
    )
    .eq("id", requestId)
    .maybeSingle();
  return { supabaseAdmin, row: (data ?? null) as Row | null };
}

/** Preferred channel for this request, with the customer profile as fallback. */
async function preferredChannel(requestId: string, customer: Row) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let method = String(customer?.['preferred_contact_method'] ?? "text");
  try {
    const { data } = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Row | null }> };
          };
        };
      }
    )
      .from("service_requests")
      .select("preferred_contact_method")
      .eq("id", requestId)
      .maybeSingle();
    if (data?.['preferred_contact_method']) method = String(data['preferred_contact_method']);
  } catch {
    /* pre-0009 database */
  }
  return method;
}

async function logComm(entry: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("request_communications" as never)
    .insert(entry as never)
    .select("id")
    .maybeSingle();
  return data ? String((data as Row)['id']) : null;
}

/**
 * Emails an admin-approved quote to the customer and records it in the request
 * conversation. Never called automatically — only from an explicit send.
 */
export async function deliverQuote(input: {
  requestId: string;
  quoteId: string;
  publicToken: string | null;
  total: number;
  message: string;
  expiresOn: string;
  adminId: string;
}): Promise<{ ok: boolean; error: string | null; channel: string }> {
  const { supabaseAdmin, row } = await loadRequest(input.requestId);
  if (!row) return { ok: false, error: "This request could not be found.", channel: "none" };

  const customer = (row['customers'] ?? {}) as Row;
  const email = String(customer['email'] ?? "").trim();
  const method = await preferredChannel(input.requestId, customer);
  const quoteUrl = input.publicToken ? `${siteUrl()}/quote/${input.publicToken}` : "";

  // SMS intent is always recorded when that is what the customer asked for.
  if (method === "text" || method === "call") {
    const phone = String(customer['phone'] ?? "").trim();
    if (phone) {
      await logComm({
        service_request_id: input.requestId,
        direction: "outbound",
        channel: "sms",
        category: "quote",
        status: "not_configured",
        sent_by: input.adminId,
        message: `Quote ${money(input.total)} — customer prefers ${method}; SMS provider not connected yet.`,
        metadata: { to: phone, quoteUrl },
      });
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !quoteUrl) {
    const error = quoteUrl
      ? "This customer has no email address on file, and SMS is not connected yet."
      : "This quote has no customer link yet.";
    await logComm({
      service_request_id: input.requestId,
      direction: "outbound",
      channel: "email",
      category: "quote",
      status: "failed",
      sent_by: input.adminId,
      message: `Quote ${money(input.total)} could not be sent.`,
      error,
    });
    return { ok: false, error, channel: "none" };
  }

  const communicationId = await logComm({
    service_request_id: input.requestId,
    direction: "outbound",
    channel: "email",
    category: "quote",
    status: "pending",
    sent_by: input.adminId,
    message: `Quote sent — estimated total ${money(input.total)}.${
      input.message ? `\n\n${input.message}` : ""
    }`,
    metadata: { quoteId: input.quoteId, quoteUrl },
  });

  const delivery = await callEmailFunction({
    mode: "quote",
    to: email,
    firstName: String(customer['first_name'] ?? "there"),
    requestNumber: String(row['request_number'] ?? ""),
    vehicle: [row['vehicles']?.year, row['vehicles']?.make, row['vehicles']?.model]
      .filter(Boolean)
      .join(" "),
    total: money(input.total),
    message: input.message,
    expiresOn: input.expiresOn,
    quoteUrl,
  });

  if (communicationId) {
    await supabaseAdmin
      .from("request_communications" as never)
      .update({
        status: delivery.ok ? "sent" : "failed",
        error: delivery.ok ? null : (delivery.error ?? "").slice(0, 400),
      } as never)
      .eq("id", communicationId);
  }

  try {
    await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
        };
      }
    )
      .from("quotes")
      .update({
        sent_channel: delivery.ok ? "email" : null,
        send_error: delivery.ok ? null : (delivery.error ?? "").slice(0, 400),
      })
      .eq("id", input.quoteId);
  } catch {
    /* pre-0009 database */
  }

  return { ok: delivery.ok, error: delivery.error ?? null, channel: delivery.ok ? "email" : "none" };
}

/**
 * Free-form admin message to the customer, delivered with a secure reply link
 * so the answer lands back on the same request. Always admin-confirmed.
 */
export async function sendCustomerMessage(input: {
  requestId: string;
  message: string;
  adminId: string;
  aiGenerated?: boolean;
  category?: "message" | "clarification";
}) {
  const { askCustomer } = await import("@/lib/repara-ai.server");
  return askCustomer({
    requestId: input.requestId,
    message: input.message,
    adminId: input.adminId,
    aiGenerated: Boolean(input.aiGenerated),
  });
}
