/**
 * Ask Repara — consumer vehicle assistant (SERVER ONLY).
 *
 * Reuses the existing Repara AI provider abstraction. The vehicle context is
 * assembled here so a driver never re-answers year / make / model / mileage.
 *
 * Hard limits carried over from the technician side: Repara AI never invents
 * DTCs, measurements, bulletin or recall numbers, procedures or specifications,
 * and never states a diagnosis it cannot support.
 */

import { isAiConfigured, runJsonCompletion, parseJsonObject } from "@/lib/ai/provider.server";

type Detail = {
  vehicle: {
    label: string;
    engine: string | null;
    drivetrain: string | null;
    currentMileage: number | null;
  };
  history: { date: string; mileage: number | null; items: string[]; providerName: string | null }[];
  maintenance: { label: string; status: string; dueMileage: number | null }[];
  recalls: { campaign: string | null; title: string }[];
  requests: { requestNumber: string; category: string; status: string }[];
};

export type AskTurn = { role: "driver" | "repara"; content: string };

export type AskAnswer = {
  reply: string;
  followUp: { question: string; options: string[] } | null;
  suggestService: boolean;
  concernSummary: string | null;
};

function renderContext(detail: Detail, language: string): string {
  const lines: string[] = [];
  lines.push(`VEHICLE: ${detail.vehicle.label}`);
  if (detail.vehicle.engine) lines.push(`ENGINE: ${detail.vehicle.engine}`);
  if (detail.vehicle.drivetrain) lines.push(`DRIVETRAIN: ${detail.vehicle.drivetrain}`);
  if (detail.vehicle.currentMileage)
    lines.push(`CURRENT MILEAGE: ${detail.vehicle.currentMileage.toLocaleString()}`);

  if (detail.history.length) {
    lines.push("SERVICE HISTORY KNOWN TO REPARA (most recent first):");
    for (const record of detail.history.slice(0, 8)) {
      lines.push(
        `- ${record.date}${record.mileage ? ` · ${record.mileage} mi` : ""}: ${
          record.items.join(", ") || "service"
        }${record.providerName ? ` (${record.providerName})` : ""}`,
      );
    }
  } else {
    lines.push("SERVICE HISTORY KNOWN TO REPARA: none recorded yet.");
  }

  if (detail.maintenance.length) {
    lines.push("MAINTENANCE STATE (source-backed only):");
    for (const item of detail.maintenance.slice(0, 8)) {
      lines.push(`- ${item.label}: ${item.status}${item.dueMileage ? ` (≈${item.dueMileage} mi)` : ""}`);
    }
  } else {
    lines.push(
      "MAINTENANCE STATE: no source-backed maintenance schedule is available for this vehicle. Say so rather than guessing intervals.",
    );
  }

  if (detail.recalls.length) {
    lines.push("SOURCE-BACKED RECALL INFORMATION (NHTSA, applies to this year/make/model):");
    for (const recall of detail.recalls.slice(0, 6)) {
      lines.push(`- ${recall.campaign ?? ""} ${recall.title}`);
    }
    lines.push(
      "Applicability does NOT establish whether the remedy was already performed on this VIN. Never say 'open' or 'unrepaired'.",
    );
  }

  if (detail.requests.length) {
    lines.push("PREVIOUS REPARA SERVICE REQUESTS:");
    for (const request of detail.requests.slice(0, 5)) {
      lines.push(`- ${request.requestNumber}: ${request.category} (${request.status})`);
    }
  }

  lines.push(`REPLY LANGUAGE: ${language === "es" ? "Spanish" : "English"}`);
  return lines.join("\n");
}

const SYSTEM = `You are Repara, a calm and trustworthy vehicle assistant talking to a normal car owner (not a mechanic).

You already know the driver's vehicle from the context. NEVER ask for year, make, model, VIN or mileage that the context already provides.

Rules you must not break:
- Explain things in plain, everyday language. No shop jargon, no lecture.
- Never claim a diagnosis. Describe what it could be, and what would confirm it.
- Never invent trouble codes, measurements, bulletin numbers, recall numbers, repair procedures, torque or fluid specifications, or maintenance intervals. If Repara has no source-backed information, say it is not available.
- Ask AT MOST ONE short follow-up question per reply, and only when the answer would change what you say. Offer 2-4 simple choices plus "Not sure" when choices make sense.
- When the vehicle likely needs hands-on attention, set suggestService true.
- Keep the reply under 120 words.

Return ONLY JSON:
{"reply":"...","follow_up":{"question":"...","options":["..."]}|null,"suggest_service":true|false,"concern_summary":"one short sentence describing the concern in the owner's own terms, or null"}`;

export async function askRepara(input: {
  detail: Detail;
  turns: AskTurn[];
  message: string;
  language: string;
}): Promise<AskAnswer> {
  if (!isAiConfigured()) {
    return {
      reply:
        "Repara AI isn't available right now. You can still request service and a technician will read your description.",
      followUp: null,
      suggestService: true,
      concernSummary: input.message.slice(0, 200),
    };
  }

  const conversation = input.turns
    .slice(-8)
    .map((turn) => `${turn.role === "driver" ? "DRIVER" : "REPARA"}: ${turn.content}`)
    .join("\n");

  const prompt = [
    renderContext(input.detail, input.language),
    conversation ? `CONVERSATION SO FAR:\n${conversation}` : "",
    `DRIVER SAYS: ${input.message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await runJsonCompletion({ system: SYSTEM, prompt, maxOutputTokens: 700 });
    const json = parseJsonObject(result.raw);
    const followUp = json['follow_up'] as { question?: string; options?: string[] } | null | undefined;

    return {
      reply: String(json['reply'] ?? "").trim() || "Tell me a little more about what you're noticing.",
      followUp:
        followUp && followUp.question
          ? {
              question: String(followUp.question),
              options: (followUp.options ?? []).map(String).slice(0, 5),
            }
          : null,
      suggestService: Boolean(json['suggest_service']),
      concernSummary: json['concern_summary'] ? String(json['concern_summary']) : null,
    };
  } catch (error) {
    console.error("[ask-repara] failed", (error as Error).message);
    return {
      reply:
        "I couldn't work through that just now. You can describe it again, or request service and a technician will take a look.",
      followUp: null,
      suggestService: true,
      concernSummary: input.message.slice(0, 200),
    };
  }
}
