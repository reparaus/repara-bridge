/**
 * Vehicle Intelligence — Garage service guidance (SERVER ONLY).
 *
 * Aggregates what Repara ALREADY knows about one Garage vehicle (vehicle
 * profile, mileage, service records, maintenance state, recalls, service
 * requests, provider quotes and approved technician recommendations) and turns
 * it into a short list of next actions.
 *
 * Rules: every item carries a reason and a provenance label; nothing is
 * invented (no health score, no made-up intervals, repairs or mileage); AI
 * guesses never appear as facts. No new tables — this reads existing data.
 */

import type { getVehicleDetail } from "./garage.server";
import { bestServiceCategory } from "@/lib/service-network";

type Db = { from: (table: string) => any };
type Row = Record<string, any>;
type Detail = Awaited<ReturnType<typeof getVehicleDetail>>;

export type InsightTone = "attention" | "recommended" | "info" | "good" | "unknown";
export type InsightSource =
  | "Repara Verified"
  | "Owner Record"
  | "Vehicle Data"
  | "Provider Record"
  | "Your request"
  | "Manufacturer data"
  | "AI Recommendation";

export type InsightAction =
  | { kind: "quote"; label: string; service?: string; cat?: string; concern?: string }
  | { kind: "find"; label: string; cat?: string }
  | { kind: "request"; label: string; requestId: string }
  | { kind: "vehicle"; label: string }
  | { kind: "ask"; label: string };

export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  /** Why this appeared — always grounded in a real record. */
  reason: string;
  source: InsightSource;
  actions: InsightAction[];
};

export type ActiveRequest = {
  id: string;
  requestNumber: string;
  title: string;
  statusLabel: string;
  quoteReady: boolean;
  quoteTotalCents: number | null;
  createdAt: string;
};

export type VehicleIntelligence = {
  insights: Insight[];
  activeRequests: ActiveRequest[];
  /** True when Repara has too little to say anything useful. */
  insufficient: boolean;
  /** Maintenance records exist and nothing is coming up. */
  upToDate: boolean;
};

function roundMiles(n: number): string {
  const r = n >= 1000 ? Math.round(n / 100) * 100 : Math.max(50, Math.round(n / 50) * 50);
  return r.toLocaleString();
}

const CLOSED = new Set(["completed", "closed", "declined", "cancelled"]);

/** Customer-facing status wording — never raw enum values. */
const STATUS_TEXT: Record<string, string> = {
  new: "Waiting for providers",
  reviewing: "Being reviewed",
  quoted: "Quote ready",
  accepted: "Quote accepted",
  scheduled: "Scheduled",
  in_progress: "In progress",
};

function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Service";
}

function requestTitle(r: Row): string {
  const services = Array.isArray(r['services']) ? (r['services'] as Row[]) : [];
  const labels = services.map((s) => String(s?.['label'] ?? "")).filter(Boolean);
  if (labels.length) return labels.slice(0, 2).join(" · ");
  return humanize(String(r['service_category_key'] ?? r['service_category'] ?? "Service"));
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function clip(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function buildVehicleIntelligence(
  db: Db,
  userId: string,
  detail: Detail,
): Promise<VehicleIntelligence> {
  const vehicleId = detail.vehicle.id;
  const insights: Insight[] = [];

  // Requests for this vehicle that belong to this user (RLS applies too).
  const { data: requestRows } = await db
    .from("service_requests")
    .select("id, request_number, status, created_at, updated_at, service_category, service_category_key, services, notes, mileage")
    .eq("vehicle_id", vehicleId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  const requests = (requestRows ?? []) as Row[];
  const requestIds = requests.map((r) => String(r['id']));

  const [quotesRes, recs] = await Promise.all([
    requestIds.length
      ? db
          .from("provider_quotes")
          .select("request_id, total_cents, status")
          .in("request_id", requestIds)
          .eq("status", "submitted")
      : Promise.resolve({ data: [] }),
    loadRecommendations(requests),
  ]);
  const openQuotes = new Map<string, number>();
  for (const q of (quotesRes?.data ?? []) as Row[]) {
    const id = String(q['request_id']);
    const total = Number(q['total_cents'] ?? 0);
    const prev = openQuotes.get(id);
    openQuotes.set(id, prev === undefined ? total : Math.min(prev, total));
  }

  // ---------------------------------------------------- active requests
  const activeRequests: ActiveRequest[] = requests
    .filter((r) => !CLOSED.has(String(r['status'])))
    .map((r) => {
      const id = String(r['id']);
      const quoteReady = openQuotes.has(id) || String(r['status']) === "quoted";
      return {
        id,
        requestNumber: String(r['request_number'] ?? ""),
        title: requestTitle(r),
        statusLabel: quoteReady ? "Quote ready" : (STATUS_TEXT[String(r['status'])] ?? humanize(String(r['status']))),
        quoteReady,
        quoteTotalCents: openQuotes.get(id) ?? null,
        createdAt: String(r['created_at']),
      };
    });

  // --------------------------- approved technician recommendations
  for (const rec of recs) {
    const request = requests.find((r) => String(r['id']) === rec.requestId);
    if (!request || !CLOSED.has(String(request['status']))) continue;
    insights.push({
      id: `rec-${rec.id}`,
      tone: rec.priority === "urgent" ? "attention" : "recommended",
      title: `${rec.title} was recommended at your last service`,
      reason: `Recorded by the technician during your ${shortDate(String(request['updated_at'] ?? request['created_at']))} service${
        rec.description ? `: “${clip(rec.description, 120)}”` : "."
      }`,
      source: "Provider Record",
      actions: [
        { kind: "quote", label: "Request a quote", cat: String(request['service_category_key'] ?? "") || undefined, concern: rec.description ? `${rec.title} — ${rec.description}` : rec.title },
        { kind: "ask", label: "Ask Repara" },
      ],
    });
  }

  // --------- concerns raised in a request that never got serviced
  const lastUnserviced = requests.find((r) => ["declined", "cancelled"].includes(String(r['status'])));
  if (lastUnserviced && !activeRequests.length) {
    const serviced = requests.some(
      (r) =>
        String(r['status']) === "completed" &&
        String(r['created_at']) > String(lastUnserviced['created_at']) &&
        (r['service_category_key'] ?? r['service_category']) ===
          (lastUnserviced['service_category_key'] ?? lastUnserviced['service_category']),
    );
    const notes = String(lastUnserviced['notes'] ?? "").trim();
    if (!serviced) {
      insights.push({
        id: `open-concern-${lastUnserviced['id']}`,
        tone: "recommended",
        title: `${requestTitle(lastUnserviced)} still open`,
        reason: notes
          ? `Your ${shortDate(String(lastUnserviced['created_at']))} request mentioned: “${clip(notes, 110)}”. No completed service has been recorded since.`
          : `You requested this on ${shortDate(String(lastUnserviced['created_at']))} and no completed service has been recorded since.`,
        source: "Your request",
        actions: [
          { kind: "quote", label: "Request a quote", cat: String(lastUnserviced['service_category_key'] ?? "") || undefined, concern: notes || undefined },
        ],
      });
    }
  }

  // ------------------------ mileage-aware maintenance guidance
  // Uses the vehicle's maintenance state (interval-derived due mileage and the
  // last completed service). Intervals are never invented here: without a due
  // mileage we only speak when the stored status already says due/overdue.
  const current = detail.vehicle.currentMileage ? Number(detail.vehicle.currentMileage) : null;
  for (const item of detail.maintenance) {
    const due = item.dueMileage ? Number(item.dueMileage) : null;
    const remaining = current !== null && due !== null ? due - current : null;
    const flaggedDue = item.status === "due" || item.status === "overdue";
    let tone: InsightTone;
    let title: string;
    const label = item.label;
    const lower = label.charAt(0).toLowerCase() + label.slice(1);
    if ((remaining !== null && remaining <= 0) || (remaining === null && flaggedDue)) {
      tone = "recommended";
      title = `Your ${lower} may be due`;
    } else if (remaining !== null && remaining <= 1500) {
      tone = "recommended";
      title = `Your ${lower} may be coming up in about ${roundMiles(remaining)} miles`;
    } else if (remaining !== null && remaining <= 5000) {
      tone = "info";
      title = `Next ${lower} in about ${roundMiles(remaining)} miles`;
    } else continue;

    const facts: string[] = [];
    if (item.lastCompletedMileage) {
      facts.push(
        `Last recorded ${lower}: ${Number(item.lastCompletedMileage).toLocaleString()} mi${item.lastCompletedDate ? ` (${shortDate(String(item.lastCompletedDate))})` : ""}.`,
      );
    }
    if (due) facts.push(`The next recorded interval is around ${due.toLocaleString()} mi.`);
    if (current) facts.push(`Your current mileage is ${current.toLocaleString()} mi.`);
    const manufacturer = /manufacturer|oem/i.test(String(item.source ?? ""));
    const cat = bestServiceCategory(label) || "maintenance";
    insights.push({
      id: `maint-${item.id}`,
      tone,
      title,
      reason: `${manufacturer ? "Based on the manufacturer schedule and your records." : "Based on the service information Repara has — an estimate, not a confirmed need."} ${facts.join(" ")}`.trim(),
      source: manufacturer ? "Manufacturer data" : "AI Recommendation",
      actions: [
        { kind: "find", label: "Find service", cat },
        { kind: "quote", label: "Request a quote", cat, concern: `Upcoming maintenance: ${label}` },
        { kind: "ask", label: "Ask Repara" },
      ],
    });
  }

  // ------------------------------------------------ recall information
  if (detail.recalls.length) {
    insights.push({
      id: "recalls",
      tone: "info",
      title: `Recall information for your ${[detail.vehicle.year, detail.vehicle.make, detail.vehicle.model].filter(Boolean).join(" ")}`,
      reason: `NHTSA lists ${detail.recalls.length} recall${detail.recalls.length > 1 ? "s" : ""} for this year, make and model. This doesn't confirm whether your car still needs the remedy.`,
      source: "Manufacturer data",
      actions: [{ kind: "vehicle", label: "View details" }],
    });
  }

  // ---------------------------------------------------- mileage gap
  if (!detail.vehicle.currentMileage) {
    insights.push({
      id: "mileage",
      tone: "unknown",
      title: "Add your current mileage",
      reason: "Mileage helps Repara connect your service history to what may come next.",
      source: "Vehicle Data",
      actions: [{ kind: "vehicle", label: "Update mileage" }],
    });
  }

  const rank: Record<InsightTone, number> = { attention: 0, recommended: 1, info: 2, unknown: 3, good: 4 };
  insights.sort((a, b) => rank[a.tone] - rank[b.tone]);

  const insufficient =
    !activeRequests.length &&
    !insights.some((i) => i.tone !== "unknown") &&
    detail.history.length === 0;
  const upToDate = !insufficient && insights.length === 0 && detail.maintenance.some((m) => m.status === "up_to_date");

  return { insights: insights.slice(0, 4), activeRequests, insufficient, upToDate };
}

/**
 * Approved (customer-facing) technician recommendations for this owner's
 * requests. The request ids come from the owner's own RLS-scoped query above,
 * so the privileged read below can never reach another customer's data. Draft
 * or AI-only recommendations are excluded.
 */
async function loadRecommendations(requests: Row[]) {
  const closedIds = requests.filter((r) => CLOSED.has(String(r['status']))).map((r) => String(r['id']));
  if (!closedIds.length) return [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as unknown as Db)
      .from("job_recommendations")
      .select("id, service_request_id, title, customer_description, priority, status, approved_at")
      .in("service_request_id", closedIds)
      .in("status", ["approved", "quoted", "customer_declined", "deferred"])
      .not("approved_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r['id']),
      requestId: String(r['service_request_id']),
      title: String(r['title']),
      description: r['customer_description'] ? String(r['customer_description']) : null,
      priority: String(r['priority'] ?? "recommended"),
    }));
  } catch (error) {
    console.error("[vehicle-intelligence] recommendations unavailable", (error as Error).message);
    return [];
  }
}

/** Compact text for Ask Repara, so answers reference real known context. */
export function renderIntelligence(intel: VehicleIntelligence): string {
  const lines: string[] = [];
  if (intel.activeRequests.length) {
    lines.push("ACTIVE REPARA REQUESTS:");
    for (const r of intel.activeRequests) lines.push(`- ${r.title}: ${r.statusLabel}`);
  }
  if (intel.insights.length) {
    lines.push("SERVICE GUIDANCE shown in the Garage (same data; each item has a source; AI Recommendation = estimate, never a confirmed need):");
    for (const i of intel.insights) lines.push(`- [${i.source}] ${i.title} — ${i.reason}`);
  }
  if (intel.insufficient) lines.push("Repara has very little history for this vehicle yet. Say so honestly.");
  return lines.join("\n");
}
