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

  if (!RESEND_API_KEY) {
    console.error("[emails] RESEND_API_KEY is not configured");
    return json({ error: "email_not_configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const BASE_COLUMNS =
    "id, request_number, created_at, status, service_area_status, city, zip_code, mileage, notes, services, service_category, customer_email_sent_at, admin_email_sent_at, customers(first_name, last_name, phone, email, preferred_contact_method), vehicles(year, make, model, trim, vin, engine_displacement, engine_code, cylinder_count, fuel_type, is_hybrid, drivetrain)";
  const FULL_COLUMNS = `${BASE_COLUMNS}, preferred_contact_method, preferred_language, intake_followups`;

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
  // the customer profile). SMS has no provider yet, so email is the carrier and
  // the SMS intent is logged instead of being silently dropped.
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

  if (validEmail && !request.customer_email_sent_at) {
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
    });
    try {
      await send(customerEmail, "Repara service request received", html);
      const now = new Date().toISOString();
      await supabase
        .from("service_requests")
        .update({
          customer_email_sent_at: now,
          confirmation_channel: "email",
          confirmation_sent_at: now,
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
    results.customer = validEmail ? "already_sent" : "skipped_no_email";
  }

  // SMS architecture placeholder: the intent is recorded so a provider can
  // later replay or take over these rows. Nothing is silently discarded.
  if ((preferred === "text" || preferred === "call") && !request.customer_email_sent_at) {
    const phone = String(customer.phone ?? "").trim();
    if (phone) {
      results.sms = "not_configured";
      await logComm({
        channel: "sms",
        category: "confirmation",
        status: "not_configured",
        message: `Customer prefers ${preferred}. SMS provider is not connected yet — confirmation went out by email.`,
        metadata: { to: phone, preferred },
      });
    }
  }


  // ---------------------------------------------------------------- admin
  if (!request.admin_email_sent_at) {
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
    results.admin = "already_sent";
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
