/**
 * send-service-request-emails
 *
 * Sends the customer confirmation + Repara admin notification for ONE saved
 * service request. The only accepted input is a request id: every value that
 * ends up in an email is read back from the database with the service role, so
 * a caller can never choose recipients, subjects or HTML.
 *
 * Idempotent: `customer_email_sent_at` / `admin_email_sent_at` on
 * `service_requests` gate each send, so retries and repeated invocations never
 * produce a second email.
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY        required
 *   REPARA_FROM_EMAIL     optional, default "Repara <requests@reparaus.com>"
 *   REPARA_ADMIN_EMAIL    optional, default "repara.us@gmail.com"
 *   REPARA_SITE_URL       optional, default "https://reparaus.com"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FROM_EMAIL = Deno.env.get("REPARA_FROM_EMAIL") ?? "Repara <requests@reparaus.com>";
const ADMIN_EMAIL = Deno.env.get("REPARA_ADMIN_EMAIL") ?? "repara.us@gmail.com";
const SITE_URL = (Deno.env.get("REPARA_SITE_URL") ?? "https://reparaus.com").replace(/\/$/, "");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let requestId = "";
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
    requestId = String(body['requestId'] ?? "");
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  // Repara AI clarification question. Caller must hold the service role key, so
  // only Repara's own server code can reach it.
  if (body['mode'] === "clarification") {
    if (!RESEND_API_KEY) return json({ error: "email_not_configured" }, 500);
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "forbidden" }, 403);

    const to = String(body['to'] ?? "").trim();
    const question = String(body['question'] ?? "").trim();
    const replyUrl = String(body['replyUrl'] ?? "").trim();
    if (!to || !question || !replyUrl.startsWith("http")) return json({ error: "invalid_body" }, 400);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject: `Quick question about your Repara request ${String(body['requestNumber'] ?? "")}`.trim(),
          html: clarificationHtml({
            firstName: esc(body['firstName'] || "there"),
            requestNumber: esc(body['requestNumber']),
            vehicle: esc(body['vehicle']),
            question: esc(question),
            replyUrl: esc(replyUrl),
          }),
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.error("[emails] clarification failed", res.status, detail);
        return json({ ok: false, error: `resend ${res.status}: ${detail}` }, 200);
      }
    } catch (e) {
      return json({ ok: false, error: (e as Error).message.slice(0, 200) }, 200);
    }
    return json({ ok: true });
  }

  // Request notifications (0023). Service-role gate. Each item is either a saved
  // in-app notification (signed-in user) or a guest event that is delivered
  // with a request-scoped secure link. Preferences are respected, duplicates are
  // blocked by dedupe_key and every outcome is logged. Never throws per item.
  if (body['mode'] === "notify") {
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "forbidden" }, 403);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const items = (Array.isArray(body['items']) ? body['items'] : []).slice(0, 25) as Record<string, unknown>[];
    const results: string[] = [];
    for (const item of items) {
      try {
        results.push(await deliverNotification(sb, item));
      } catch (e) {
        console.error("[notify] item failed", (e as Error).message);
        results.push("failed");
      }
    }
    return json({ ok: true, results });
  }

  // Admin-confirmed quote delivery. Same service-role gate as clarification:
  // only Repara's own server code can reach it, and it never prices anything
  // itself — the amounts are passed in from the saved quote.
  if (body['mode'] === "quote") {
    if (!RESEND_API_KEY) return json({ error: "email_not_configured" }, 500);
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "forbidden" }, 403);

    const to = String(body['to'] ?? "").trim();
    const quoteUrl = String(body['quoteUrl'] ?? "").trim();
    if (!to || !quoteUrl.startsWith("http")) return json({ error: "invalid_body" }, 400);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject: `Your Repara quote ${String(body['requestNumber'] ?? "")}`.trim(),
          html: quoteHtml({
            firstName: esc(body['firstName'] || "there"),
            requestNumber: esc(body['requestNumber']),
            vehicle: esc(body['vehicle']),
            total: esc(body['total']),
            message: esc(body['message']),
            expiresOn: esc(body['expiresOn']),
            quoteUrl: esc(quoteUrl),
          }),
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.error("[emails] quote failed", res.status, detail);
        return json({ ok: false, error: `resend ${res.status}: ${detail}` }, 200);
      }
    } catch (e) {
      return json({ ok: false, error: (e as Error).message.slice(0, 200) }, 200);
    }
    return json({ ok: true });
  }

  if (!UUID.test(requestId)) return json({ error: "invalid_request_id" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const BASE_COLUMNS =
    "id, request_number, created_at, status, service_area_status, city, zip_code, mileage, notes, services, service_category, customer_email_sent_at, admin_email_sent_at, user_id, customers(first_name, last_name, phone, email, preferred_contact_method), vehicles(year, make, model, trim, vin, engine_displacement, engine_code, cylinder_count, fuel_type, is_hybrid, drivetrain)";
  const FULL_COLUMNS = `${BASE_COLUMNS}, preferred_contact_method, preferred_language, intake_followups, phone_e164, sms_consent_at`;

  let { data: request, error } = await supabase
    .from("service_requests")
    .select(FULL_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();

  // Tolerate a database that has not run the newest migration yet.
  if (error) {
    ({ data: request, error } = await supabase
      .from("service_requests")
      .select(BASE_COLUMNS)
      .eq("id", requestId)
      .maybeSingle());
  }

  if (error || !request) {
    console.error("[emails] request lookup failed", error?.message);
    return json({ error: "request_not_found" }, 404);
  }

  const customer = (request as any).customers ?? {};
  const vehicle = (request as any).vehicles ?? {};
  const services: string[] = Array.isArray(request.services)
    ? (request.services as any[])
        .map((s) => (typeof s === "string" ? s : s?.label || s?.key))
        .filter(Boolean)
    : [];
  const serviceText = services.length ? services.join(", ") : String(request.service_category ?? "—");
  const vehicleText = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—";
  const outside = request.service_area_status === "outside_area";
  const areaText = outside
    ? "Outside current service area"
    : request.service_area_status === "eligible"
      ? "In service area"
      : "Being reviewed";
  const location = [request.city, request.zip_code].filter(Boolean).join(", ") || "—";
  const engine = [
    vehicle.engine_displacement ? `${vehicle.engine_displacement}L` : null,
    vehicle.cylinder_count ? `${vehicle.cylinder_count}-cyl` : null,
    vehicle.fuel_type,
    vehicle.is_hybrid ? "hybrid" : null,
    vehicle.engine_code,
  ]
    .filter(Boolean)
    .join(" · ") || "—";

  // Preferred channel for this request (per-request snapshot, falling back to
  // the customer profile). A text-only selection must never send customer email.
  const preferred = String(
    (request as any).preferred_contact_method ?? customer.preferred_contact_method ?? "text",
  );
  const followups: any[] = Array.isArray((request as any).intake_followups)
    ? ((request as any).intake_followups as any[])
    : [];
  const intakeSummary = String(
    followups.find((f) => f?.category === "intake_summary")?.answer ?? "",
  );

  const results: Record<string, string> = {};
  const errors: string[] = [];

  async function send(to: string, subject: string, html: string) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  /** One shared conversation per request: confirmations live in it too. */
  async function logComm(entry: Record<string, unknown>) {
    try {
      await supabase.from("request_communications").insert({
        service_request_id: request.id,
        direction: "outbound",
        ...entry,
      });
    } catch (e) {
      console.error("[emails] communication log failed", (e as Error).message);
    }
  }

  // ------------------------------------------------------------- customer
  const customerEmail = String(customer.email ?? "").trim();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customerEmail);

  // SMS first (0024): text/both preference, explicit consent, valid E.164.
  // Failures are logged; text-only never falls back to customer email.
  const smsWanted = preferred === "text" || preferred === "both";
  let smsOutcome = "not_wanted";
  let guestLink = "";
  const linkOnce = async () => (guestLink ||= await mintGuestLink(supabase, String(request.id)).catch(() => ""));
  if (smsWanted) {
    const phone = toE164((request as any).phone_e164 ?? customer.phone);
    const dedupe = `sms:confirmation:${request.id}`;
    const { data: already } = await supabase.from("notification_deliveries").select("status").eq("dedupe_key", dedupe).maybeSingle();
    if (already) smsOutcome = already.status;
    else {
      const base = { dedupe_key: dedupe, channel: "sms", service_request_id: request.id, event_type: "request_submitted", audience: request.user_id ? "driver" : "guest" };
      if (!(request as any).sms_consent_at) smsOutcome = "skipped_no_consent";
      else if (!phone) smsOutcome = "skipped_invalid_phone";
      else {
        const veh = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
        const link = await linkOnce();
        const r = await sendSms(phone, `Repara: Your service request${veh ? ` for your ${veh}` : ""} was received. View your private request: ${link}`);
        smsOutcome = r.status;
        await logDelivery(supabase, { ...base, status: r.status, error: r.error ?? null, provider_message_id: r.sid ?? null });
        await logComm({ channel: "sms", category: "confirmation", status: r.status === "sent" ? "sent" : "failed", message: r.status === "sent" ? "Request received — confirmation text sent." : `Confirmation text not sent (${r.status}).`, ...(r.error ? { error: r.error.slice(0, 400) } : {}) });
      }
      if (smsOutcome !== "sent" && !["failed", "not_configured"].includes(smsOutcome)) {
        await logDelivery(supabase, { ...base, status: smsOutcome });
      }
      if (smsOutcome === "sent") {
        await supabase.from("service_requests").update({ confirmation_channel: "sms", confirmation_sent_at: new Date().toISOString() }).eq("id", request.id);
      }
    }
    results.sms = smsOutcome;
  }
  // Text-only customers never get the confirmation email; failures are logged for admin.
  const emailWanted = !smsWanted || preferred === "both";

  if (emailWanted && validEmail && !request.customer_email_sent_at && RESEND_API_KEY) {
    const intro = outside
      ? "Your request has been received. Repara does not currently service your area, but we've saved your request as we evaluate future service areas."
      : "Your service request has been received. We'll review the details and contact you shortly.";
    const html = customerHtml({
      firstName: esc(customer.first_name || "there"),
      intro: esc(intro),
      vehicleText: esc(vehicleText),
      serviceText: esc(serviceText),
      location: esc(location),
      areaText: esc(areaText),
      requestNumber: esc(request.request_number ?? ""),
      link: await linkOnce(),
    });
    try {
      await send(customerEmail, "Repara — Your service request was received", html);
      const now = new Date().toISOString();
      await supabase
        .from("service_requests")
        .update({
          customer_email_sent_at: now,
          ...(smsOutcome === "sent" ? {} : { confirmation_channel: "email", confirmation_sent_at: now }),
        })
        .eq("id", request.id);
      results.customer = "sent";
      await logComm({
        channel: "email",
        category: "confirmation",
        status: "sent",
        message: `Request received — confirmation sent to ${customerEmail}.`,
      });
    } catch (e) {
      results.customer = "failed";
      errors.push(`customer: ${(e as Error).message}`);
      console.error("[emails] customer send failed", (e as Error).message);
      await logComm({
        channel: "email",
        category: "confirmation",
        status: "failed",
        message: "Request received — confirmation email could not be delivered.",
        error: (e as Error).message.slice(0, 400),
      });
    }
  } else {
    results.customer = !emailWanted
      ? "skipped_pref"
      : !validEmail
        ? "skipped_no_email"
        : !RESEND_API_KEY
          ? "not_configured"
          : "already_sent";
  }



  // ---------------------------------------------------------------- admin
  if (!request.admin_email_sent_at && RESEND_API_KEY) {
    const rows: [string, string][] = [
      ["Request", `${request.request_number ?? ""} (${request.id})`],
      ["Submitted", new Date(String(request.created_at)).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })],
      ["Service area", areaText],
      ["Customer", [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"],
      ["Preferred contact", preferred],
      ["Language", String((request as any).preferred_language ?? "en") === "es" ? "Spanish" : "English"],
      ["Phone", customer.phone || "—"],
      ["Email", customerEmail || "—"],
      ["City / ZIP", location],
      ["Vehicle", [vehicleText, vehicle.trim].filter(Boolean).join(" ")],
      ["VIN", vehicle.vin || "—"],
      ["Engine", engine],
      ["Drivetrain", vehicle.drivetrain || "—"],
      ["Mileage", request.mileage ? Number(request.mileage).toLocaleString("en-US") : "—"],
      ["Services", serviceText],
      // Customer concern first: it is what an admin actually reads on a phone.
      ["Concern", intakeSummary || request.notes || "—"],
      ["Notes", request.notes || "—"],
    ];
    const subject = `New Repara Request — ${vehicleText} — ${request.zip_code ?? "—"}`;
    const html = adminHtml({
      outside,
      rows: rows.map(([k, v]) => [esc(k), esc(v)] as [string, string]),
      link: `${SITE_URL}/admin/requests/${request.id}`,
    });
    try {
      await send(ADMIN_EMAIL, subject, html);
      await supabase
        .from("service_requests")
        .update({ admin_email_sent_at: new Date().toISOString() })
        .eq("id", request.id);
      results.admin = "sent";
    } catch (e) {
      results.admin = "failed";
      errors.push(`admin: ${(e as Error).message}`);
      console.error("[emails] admin send failed", (e as Error).message);
    }
  } else {
    results.admin = RESEND_API_KEY ? "already_sent" : "not_configured";
  }

  await supabase
    .from("service_requests")
    .update({
      email_status: errors.length ? "partial" : "sent",
      email_last_error: errors.length ? errors.join(" | ").slice(0, 500) : null,
    })
    .eq("id", request.id);

  // Never leak customer data or provider errors in the response body.
  return json({ ok: errors.length === 0, results });
});

function shell(inner: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:#111111;">
<div style="max-width:560px;margin:0 auto;border:1px solid #e5e5e5;border-radius:12px;padding:28px 24px;">
<div style="font-size:20px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;">Repara</div>
<div style="height:1px;background:#111111;margin:16px 0 22px;"></div>
${inner}
<div style="height:1px;background:#e5e5e5;margin:24px 0 14px;"></div>
<p style="font-size:12px;line-height:1.6;color:#666666;margin:0;">
<a href="https://reparaus.com" style="color:#111111;">reparaus.com</a></p>
</div></body></html>`;
}

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 12px 6px 0;font-size:12px;color:#666666;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 0;font-size:14px;color:#111111;">${value}</td></tr>`;
}

function customerHtml(d: {
  firstName: string;
  intro: string;
  vehicleText: string;
  serviceText: string;
  location: string;
  areaText: string;
  requestNumber: string;
  link?: string;
}) {
  return shell(`
<h1 style="font-size:20px;margin:0 0 12px;">Request received</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 18px;">Hi ${d.firstName}, ${d.intro}</p>
<table style="width:100%;border-collapse:collapse;">
${row("Request", d.requestNumber)}
${row("Vehicle", d.vehicleText)}
${row("Service", d.serviceText)}
${row("Location", d.location)}
${row("Service area", d.areaText)}
</table>
${d.link ? button(d.link, "View request") : ""}
<table style="width:100%;border-collapse:collapse;">
</table>
<p style="font-size:12px;line-height:1.6;color:#666666;margin:22px 0 0;">
This is a confirmation that we received your request. It is not a final estimate or a confirmed appointment.</p>`);
}

function adminHtml(d: { outside: boolean; rows: [string, string][]; link: string }) {
  const banner = d.outside
    ? `<div style="border:2px solid #111111;background:#f5f5f5;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:700;margin:0 0 18px;">OUTSIDE SERVICE AREA</div>`
    : "";
  return shell(`
${banner}
<h1 style="font-size:20px;margin:0 0 16px;">New service request</h1>
<table style="width:100%;border-collapse:collapse;">${d.rows.map(([k, v]) => row(k, v)).join("")}</table>
<p style="margin:24px 0 0;">
<a href="${d.link}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;">Open request</a></p>`);
}

/** Repara AI clarification question. Plain, no pricing, no diagnosis claims. */
function clarificationHtml(d: {
  firstName: string;
  requestNumber: string;
  vehicle: string;
  question: string;
  replyUrl: string;
}) {
  return shell(`
    <h1 style="margin:0 0 16px;font-size:20px;">Hi ${d.firstName},</h1>
    <p style="margin:0 0 16px;line-height:1.6;">
      Thanks for your Repara request${d.requestNumber ? ` <strong>${d.requestNumber}</strong>` : ""}${
        d.vehicle ? ` for your ${d.vehicle}` : ""
      }. Before we can finish reviewing it, we have a quick question:
    </p>
    <p style="margin:0 0 24px;padding:14px 16px;background:#f4f4f5;border-radius:10px;line-height:1.6;">
      ${d.question}
    </p>
    <p style="margin:0 0 24px;">
      <a href="${d.replyUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;">Answer the question</a>
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      No account needed — the link opens a short form. You can also reply to this email.
    </p>
  `);
}

/**
 * Admin-sent quote notification. Contains only the customer-facing amounts and
 * message that the admin already reviewed; internal costs never reach here.
 */
function quoteHtml(d: {
  firstName: string;
  requestNumber: string;
  vehicle: string;
  total: string;
  message: string;
  expiresOn: string;
  quoteUrl: string;
}) {
  return shell(`
    <h1 style="margin:0 0 16px;font-size:20px;">Hi ${d.firstName},</h1>
    <p style="margin:0 0 16px;line-height:1.6;">
      Your Repara quote${d.requestNumber ? ` for request <strong>${d.requestNumber}</strong>` : ""}${
        d.vehicle ? ` (${d.vehicle})` : ""
      } is ready.
    </p>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Estimated total", `<strong>${d.total}</strong>`)}
      ${d.expiresOn ? row("Valid through", d.expiresOn) : ""}
    </table>
    ${
      d.message
        ? `<p style="margin:18px 0 0;padding:14px 16px;background:#f4f4f5;border-radius:10px;line-height:1.6;">${d.message}</p>`
        : ""
    }
    <p style="margin:24px 0 0;">
      <a href="${d.quoteUrl}" style="display:inline-block;padding:12px 22px;background:#111111;color:#ffffff;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:.12em;text-transform:uppercase;">View your quote</a>
    </p>
    <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#666666;">
      You can approve or decline the quote from that link. No account needed.
    </p>
  `);
}

// ------------------------------------------------------------ notify (0023)
function button(href: string, label: string) {
  return `<p style="margin:24px 0 0;"><a href="${esc(href)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;">${esc(label)}</a></p>`;
}

async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Request-scoped guest link. Only the hash is stored. */
// deno-lint-ignore no-explicit-any
async function mintGuestLink(sb: any, requestId: string) {
  const raw = new Uint8Array(24);
  crypto.getRandomValues(raw);
  const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const { error } = await sb.from("request_access_tokens").insert({ token_hash: await sha256Hex(token), service_request_id: requestId });
  if (error) throw new Error(error.message);
  return `${SITE_URL}/r/${token}`;
}

const SUBJECTS: Record<string, string> = {
  provider_new_request: "Repara — New Service Request",
  provider_message: "Repara — New message from a customer",
  provider_quote_accepted: "Repara — Quote accepted",
  message_received: "Repara — New message about your request",
  quote_received: "Repara — New quote available",
  request_status: "Repara — Request update",
  request_submitted: "Repara — Your service request was received",
  // Future (no scheduling yet): copy is ready, nothing emits these events.
  appointment_requested: "Repara — Appointment requested",
  appointment_confirmed: "Repara — Appointment confirmed",
  appointment_rescheduled: "Repara — Appointment rescheduled",
  appointment_cancelled: "Repara — Appointment cancelled",
  appointment_reminder: "Repara — Appointment reminder",
};

// ------------------------------------------------------------------ SMS (0024)
/** E.164 or null. Numbers without a country code are treated as +1. */
function toE164(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+")) return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null;
  if (d.length === 10 && /^[2-9]\d{2}[2-9]/.test(d)) return `+1${d}`;
  if (d.length === 11 && /^1[2-9]\d{2}[2-9]/.test(d)) return `+${d}`;
  return null;
}

type SmsResult = { status: "sent" | "failed" | "not_configured" | "skipped_invalid_phone"; sid?: string; error?: string };

/** Short transactional SMS through Twilio. Secrets stay in this function. */
async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!sid || !token || !from) return { status: "not_configured" };
  const phone = toE164(to);
  if (!phone) return { status: "skipped_invalid_phone" };
  const text = body.replace(/\s+/g, " ").trim().slice(0, 320);
  if (!text) return { status: "failed", error: "empty message" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: from, Body: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "failed", error: `twilio ${res.status}: ${String(data?.message ?? "").slice(0, 300)}` };
    return { status: "sent", sid: String(data?.sid ?? "") };
  } catch (e) {
    return { status: "failed", error: (e as Error).message.slice(0, 300) };
  }
}

/** Short SMS copy. No customer details beyond the vehicle. */
function smsText(event: string, ctx: { vehicle?: string; provider?: string; total?: string; link: string }) {
  const v = ctx.vehicle ? ` for a ${ctx.vehicle}` : "";
  const map: Record<string, string> = {
    provider_new_request: `Repara: You have a new service request${v}. View request: ${ctx.link}`,
    provider_message: `Repara: You have a new customer message. View it: ${ctx.link}`,
    provider_quote_accepted: `Repara: Your quote was accepted. Help the customer schedule: ${ctx.link}`,
    message_received: `Repara: You have a new message about your service request. View it: ${ctx.link}`,
    quote_received: `Repara: You have a new ${ctx.total ? `${ctx.total} ` : ""}quote${ctx.provider ? ` from ${ctx.provider}` : ""}. Review: ${ctx.link}`,
    request_status: `Repara: There is an update on your service request. View it: ${ctx.link}`,
    appointment_requested: `Repara: An appointment was requested. View: ${ctx.link}`,
    appointment_confirmed: `Repara: Your appointment is confirmed. View: ${ctx.link}`,
    appointment_rescheduled: `Repara: Your appointment was rescheduled. View: ${ctx.link}`,
    appointment_cancelled: `Repara: Your appointment was cancelled. View: ${ctx.link}`,
    appointment_reminder: `Repara: Reminder about your upcoming appointment. View: ${ctx.link}`,
  };
  return map[event] ?? `Repara: You have an update. View: ${ctx.link}`;
}

// deno-lint-ignore no-explicit-any
async function logDelivery(sb: any, row: Record<string, unknown>) {
  const { error } = await sb.from("notification_deliveries").insert(row);
  if (error && /provider_message_id/.test(error.message)) {
    const { provider_message_id: _drop, ...rest } = row;
    return !(await sb.from("notification_deliveries").insert(rest)).error;
  }
  return !error; // unique violation = already handled
}

// deno-lint-ignore no-explicit-any
async function alreadyDelivered(sb: any, key: string) {
  const { data } = await sb.from("notification_deliveries").select("id").eq("dedupe_key", key).maybeSingle();
  return !!data;
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function sendMail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error("email_not_configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

/**
 * One notification → each chosen external channel (email and/or SMS), each
 * with its own dedupe key and delivery-log row. In-app already exists.
 */
// deno-lint-ignore no-explicit-any
async function deliverChannels(sb: any, o: {
  keyBase: string;
  base: Record<string, unknown>;
  channel: string; // email | sms | both | in_app
  email: string;
  phone: string | null;
  smsConsent: boolean;
  emailOff: boolean;
  smsOff: boolean;
  subject: string;
  html: () => Promise<string>;
  sms: () => Promise<string>;
}): Promise<string> {
  const out: string[] = [];
  const doEmail = o.channel === "email" || o.channel === "both";
  const doSms = o.channel === "sms" || o.channel === "both";
  if (doSms) {
    const key = `sms:${o.keyBase}`;
    if (await alreadyDelivered(sb, key)) out.push("sms:duplicate");
    else {
      const row = { ...o.base, dedupe_key: key, channel: "sms" };
      let status: string;
      if (o.smsOff) status = "skipped_pref";
      else if (!o.smsConsent) status = "skipped_no_consent";
      else if (!o.phone) status = "skipped_invalid_phone";
      else {
        const r = await sendSms(o.phone, await o.sms());
        await logDelivery(sb, { ...row, status: r.status, error: r.error ?? null, provider_message_id: r.sid ?? null });
        out.push(`sms:${r.status}`);
        status = "";
      }
      if (status) {
        await logDelivery(sb, { ...row, status });
        out.push(`sms:${status}`);
      }
    }
  }
  if (doEmail) {
    const key = `email:${o.keyBase}`;
    const row = { ...o.base, dedupe_key: key, channel: "email" };
    if (await alreadyDelivered(sb, key)) out.push("email:duplicate");
    else if (o.emailOff) { await logDelivery(sb, { ...row, status: "skipped_pref" }); out.push("email:skipped_pref"); }
    else if (!validEmail(o.email)) { await logDelivery(sb, { ...row, status: "skipped_no_address" }); out.push("email:skipped_no_address"); }
    else if (!RESEND_API_KEY) { await logDelivery(sb, { ...row, status: "not_configured" }); out.push("email:not_configured"); }
    else {
      try {
        await sendMail(o.email, o.subject, await o.html());
        await logDelivery(sb, { ...row, status: "sent" });
        out.push("email:sent");
      } catch (e) {
        await logDelivery(sb, { ...row, status: "failed", error: (e as Error).message.slice(0, 400) });
        out.push("email:failed");
      }
    }
  }
  return out.join(",") || "in_app_only";
}

const CHANNELS = ["email", "sms", "both", "in_app"];

// deno-lint-ignore no-explicit-any
async function deliverNotification(sb: any, item: Record<string, unknown>): Promise<string> {
  if (item["kind"] === "user") {
    const id = String(item["notificationId"] ?? "");
    if (!UUID.test(id)) return "invalid";
    const { data: n } = await sb.from("notifications").select("id, user_id, provider_id, event_type, title, body, link, service_request_id, audience").eq("id", id).maybeSingle();
    if (!n) return "missing";
    const { data: prof } = await sb.from("profiles").select("*").eq("id", n.user_id).maybeSingle();
    const prefs = prof?.notification_preferences ?? {};
    let channel = CHANNELS.includes(prof?.notify_channel) ? prof.notify_channel : "email";
    let email = "";
    let phone: string | null = toE164(prof?.phone_e164 ?? prof?.phone);
    let consent = !!prof?.sms_consent_at;
    if (n.audience === "provider" && n.provider_id) {
      const { data: p } = await sb.from("service_providers").select("*").eq("id", n.provider_id).maybeSingle();
      email = String(p?.email ?? "").trim();
      channel = CHANNELS.includes(p?.notify_channel) ? p.notify_channel : "email";
      phone = toE164(p?.notify_phone_e164 ?? p?.phone);
      consent = !!p?.sms_consent_at;
    }
    if (!validEmail(email)) {
      const { data: u } = await sb.auth.admin.getUserById(n.user_id);
      email = String(u?.user?.email ?? "").trim();
    }
    let vehicle = "";
    if (n.service_request_id) {
      const { data: r } = await sb.from("service_requests").select("vehicles(year, make, model)").eq("id", n.service_request_id).maybeSingle();
      vehicle = [r?.vehicles?.year, r?.vehicles?.make, r?.vehicles?.model].filter(Boolean).join(" ");
    }
    const link = `${SITE_URL}${n.link ?? ""}`;
    return deliverChannels(sb, {
      keyBase: String(n.id),
      base: { notification_id: n.id, service_request_id: n.service_request_id, event_type: n.event_type, audience: n.audience },
      channel, email, phone, smsConsent: consent,
      emailOff: prefs[`email.${n.event_type}`] === false,
      smsOff: prefs[`sms.${n.event_type}`] === false,
      subject: SUBJECTS[n.event_type] ?? "Repara — Update",
      html: async () => shell(`<h1 style="font-size:20px;margin:0 0 12px;">${esc(n.title)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0;">${esc(n.body ?? "")}</p>
${n.link ? button(link, "Open in Repara") : ""}`),
      sms: async () => smsText(n.event_type, { vehicle, link }),
    });
  }

  if (item["kind"] === "guest") {
    const requestId = String(item["requestId"] ?? "");
    const event = String(item["event"] ?? "");
    const ref = String(item["ref"] ?? "").slice(0, 80);
    if (!UUID.test(requestId) || !["message_received", "quote_received", "request_status"].includes(event)) return "invalid";
    const { data: r } = await sb.from("service_requests").select("*, customers(email, first_name, phone, preferred_contact_method), vehicles(year, make, model)").eq("id", requestId).maybeSingle();
    if (!r || r.user_id) return "not_guest";
    const pref = String(r.preferred_contact_method ?? r.customers?.preferred_contact_method ?? "email");
    // text → SMS, both → both, email/call → email. Text-only never falls back
    // to email, including when consent, phone validation or Twilio fails.
    const phone = toE164(r.phone_e164 ?? r.customers?.phone);
    const channel = pref === "both" ? "both" : pref === "text" ? "sms" : "email";
    const vehicle = [r.vehicles?.year, r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(" ") || `Request ${r.request_number}`;
    const provider = String(item["providerName"] ?? "Your provider").slice(0, 120);
    const total = typeof item["totalCents"] === "number" ? `$${((item["totalCents"] as number) / 100).toFixed(0)}` : "";
    let link = "";
    const getLink = async () => (link ||= await mintGuestLink(sb, requestId));
    const lines: Record<string, [string, string]> = {
      message_received: ["New message", `${provider} sent you a message about your ${vehicle}.`],
      quote_received: ["New quote available", `${provider} sent you a quote for your ${vehicle}${total ? ` — ${total}` : ""}.`],
      request_status: ["Request update", `There is an update on your ${vehicle} request.`],
    };
    const [title, text] = lines[event]!;
    return deliverChannels(sb, {
      keyBase: `guest:${event}:${ref || requestId}`,
      base: { service_request_id: requestId, event_type: event, audience: "guest" },
      channel, email: String(r.customers?.email ?? "").trim(), phone, smsConsent: !!r.sms_consent_at,
      emailOff: false, smsOff: false,
      subject: SUBJECTS[event] ?? "Repara — Update",
      html: async () => shell(`<h1 style="font-size:20px;margin:0 0 12px;">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0;">Hi ${esc(r.customers?.first_name || "there")}, ${esc(text)}</p>
${button(await getLink(), "View request")}`),
      sms: async () => smsText(event, { provider: item["providerName"] ? provider : "", total, link: await getLink() }),
    });
  }
  return "invalid";
}
