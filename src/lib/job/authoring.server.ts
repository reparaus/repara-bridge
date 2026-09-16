/**
 * Repara AI — technician authoring assistance (SERVER ONLY).
 *
 * These helpers turn technician shorthand into professional documentation. They
 * are strictly assistive:
 *   • Nothing here writes to the job. Every result comes back as a DRAFT that a
 *     human approves, edits, regenerates or cancels.
 *   • The model may only rewrite information it was given. Adding a cause,
 *     measurement, part or safety claim that the technician did not document is
 *     forbidden by prompt and stripped by validation where detectable.
 */

import { parseJsonObject, runJsonCompletion } from "@/lib/ai/provider.server";
import { assembleJobContext, renderJobContext } from "./job-context.server";
import { renderConcern, type ConcernRow } from "./concerns.server";

type Client = { from: (table: string) => any };

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

const NO_INVENTION = `Absolute rules:
- Use ONLY information given to you. Never add a cause, measurement, torque value, part name, part number, price, mileage or safety claim that is not in the input.
- Never state a cause as confirmed unless the technician's input already confirms it. Otherwise word it as an observation.
- Keep customer-facing wording plain and calm: no scare language, no guarantees, no pricing, no "must be replaced immediately".
- Never claim work was performed unless the input says it was performed.`;

async function vehicleHeader(client: Client, requestId: string): Promise<string> {
  const context = await assembleJobContext(client, requestId, ["vehicle", "stage"]);
  return renderJobContext(context);
}

/* ------------------------------------------------- shorthand → tech story */

export type StoryDraft = {
  story: string;
  technicianObserved: string;
  confirmedCause: string;
  testsPerformed: string;
  omitted: string[];
};

/**
 * Cleans up raw technician shorthand ("cold start rattle 2 sec, vvti solenoid
 * screen dirty, oil 40% life") into a documentation-quality account, split by
 * provenance so nothing gets promoted into a confirmed cause by accident.
 */
export async function draftStoryFromShorthand(input: {
  client: Client;
  requestId: string;
  concern: ConcernRow;
  shorthand: string;
}): Promise<StoryDraft> {
  const header = await vehicleHeader(input.client, input.requestId);
  const result = await runJsonCompletion({
    system: `You write professional automotive repair documentation from a technician's shorthand notes. ${NO_INVENTION}

Separate the notes by provenance:
- tests_performed: what the technician checked, measured or tested.
- technician_observed: what was actually observed or measured (facts, not conclusions).
- confirmed_cause: ONLY if the notes clearly confirm the cause; otherwise "".
- story: 2–5 sentences of clean technician-voice narrative combining the above, suitable for the repair order.
- omitted: anything in the notes you could not interpret, so the technician can clarify it.

Reply with ONLY this json object:
{"story":string,"technician_observed":string,"confirmed_cause":string,"tests_performed":string,"omitted":[string]}`,
    user: `${header}\n\n${renderConcern(input.concern)}\n\n## Technician shorthand notes\n${input.shorthand}\n\nReply with the json object only.`,
    temperature: 0.2,
    maxOutputTokens: 900,
  });

  const parsed = parseJsonObject(result.text);
  return {
    story: str(parsed['story'], 3000),
    technicianObserved: str(parsed['technician_observed'], 2000),
    confirmedCause: str(parsed['confirmed_cause'], 1000),
    testsPerformed: str(parsed['tests_performed'], 1000),
    omitted: arr(parsed['omitted']).slice(0, 6).map((x) => str(x, 200)).filter(Boolean),
  };
}

/* ------------------------------------------------------- findings drafting */

export type FindingDraft = {
  title: string;
  detail: string;
  evidence: string;
  measurement: string;
  severity: "urgent" | "recommended" | "monitor" | "informational";
  confidence: "confirmed" | "suspected";
};

const SEVERITIES = ["urgent", "recommended", "monitor", "informational"] as const;

/** Turns an approved diagnosis account into candidate findings (drafts only). */
export async function draftFindings(input: {
  client: Client;
  requestId: string;
  concern: ConcernRow;
  source: string;
}): Promise<FindingDraft[]> {
  const header = await vehicleHeader(input.client, input.requestId);
  const result = await runJsonCompletion({
    system: `You extract structured technician FINDINGS from documented diagnostic work. ${NO_INVENTION}

A finding is one discrete condition the technician documented — never a recommendation, never a price.
- evidence: the specific observation/measurement that supports it, taken from the input.
- confidence: "confirmed" only when the input confirms it; otherwise "suspected".
- severity: urgent | recommended | monitor | informational.
Return 1–5 findings. If the input supports none, return an empty array.

Reply with ONLY this json object:
{"findings":[{"title":string,"detail":string,"evidence":string,"measurement":string,"severity":"urgent"|"recommended"|"monitor"|"informational","confidence":"confirmed"|"suspected"}]}`,
    user: `${header}\n\n${renderConcern(input.concern)}\n\n## Documented diagnostic account\n${input.source}\n\nReply with the json object only.`,
    temperature: 0.2,
    maxOutputTokens: 1000,
  });

  const parsed = parseJsonObject(result.text);
  return arr(parsed['findings'])
    .slice(0, 5)
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      const severity = str(o['severity'], 20) as FindingDraft["severity"];
      return {
        title: str(o['title'], 160),
        detail: str(o['detail'], 1200),
        evidence: str(o['evidence'], 600),
        measurement: str(o['measurement'], 120),
        severity: (SEVERITIES as readonly string[]).includes(severity) ? severity : "recommended",
        confidence: str(o['confidence'], 20) === "confirmed" ? ("confirmed" as const) : ("suspected" as const),
      };
    })
    .filter((f) => f.title);
}

/* --------------------------------------- one natural note → one finding */

export type FindingNoteDraft = {
  title: string;
  detail: string;
  measurement: string;
  system: string;
  suggestedCondition: "good" | "monitor" | "needs_attention" | "not_inspected" | "";
  safetySupported: boolean;
};

const SYSTEMS = [
  "Brakes",
  "Electrical",
  "Tires & Wheels",
  "Engine",
  "Transmission & Driveline",
  "Suspension & Steering",
  "HVAC",
  "Cooling",
  "Fuel",
  "Exhaust",
  "Body & Interior",
  "Fluids & Maintenance",
  "Other",
];

/**
 * Cleans up one inspection note ("rear pads 3mm, inner lip on rotor") into a
 * findings-sheet entry. The condition is only ever a SUGGESTION — the
 * technician's chip selection wins — and a safety claim is only echoed back
 * when the note itself supports it.
 */
export async function draftFindingFromNote(input: {
  client: Client;
  requestId: string;
  note: string;
  condition: string;
}): Promise<FindingNoteDraft> {
  const header = await vehicleHeader(input.client, input.requestId);
  const result = await runJsonCompletion({
    system: `You turn one short technician inspection note into a clean findings-sheet entry. ${NO_INVENTION}

- title: one short line naming the condition found (no pricing, no recommendation).
- detail: 1-2 clean sentences of what was inspected and observed.
- measurement: any measurement present in the note, verbatim units; otherwise "".
- system: EXACTLY one of: ${SYSTEMS.join(" | ")}. Use "Other" when unsure.
- suggested_condition: good | monitor | needs_attention | not_inspected, or "" if the note does not indicate one.
- safety_supported: true ONLY if the note itself documents a safety-affecting condition. Never true from severity alone.

Reply with ONLY this json object:
{"title":string,"detail":string,"measurement":string,"system":string,"suggested_condition":string,"safety_supported":boolean}`,
    user: `${header}\n\n## Technician selected condition\n${input.condition}\n\n## Technician note\n${input.note}\n\nReply with the json object only.`,
    temperature: 0.2,
    maxOutputTokens: 600,
  });

  const parsed = parseJsonObject(result.text);
  const system = str(parsed['system'], 60);
  const condition = str(parsed['suggested_condition'], 30);
  const conditions = ["good", "monitor", "needs_attention", "not_inspected"];
  return {
    title: str(parsed['title'], 160),
    detail: str(parsed['detail'], 1200),
    measurement: str(parsed['measurement'], 120),
    system: SYSTEMS.includes(system) ? system : "Other",
    suggestedCondition: (conditions.includes(condition)
      ? condition
      : "") as FindingNoteDraft["suggestedCondition"],
    safetySupported: parsed['safety_supported'] === true,
  };
}

/* ------------------------------------------------ recommendations drafting */

export type RecommendationDraft = {
  title: string;
  customerDescription: string;
  internalNotes: string;
  priority: "urgent" | "recommended" | "monitor";
};

/**
 * Drafts recommendations from findings. Customer wording and internal wording
 * are generated separately on purpose — the customer explanation must never be
 * a copy of internal technical shorthand.
 */
export async function draftRecommendations(input: {
  client: Client;
  requestId: string;
  concern: ConcernRow | null;
  findings: string;
}): Promise<RecommendationDraft[]> {
  const header = await vehicleHeader(input.client, input.requestId);
  const result = await runJsonCompletion({
    system: `You draft service RECOMMENDATIONS from documented technician findings. ${NO_INVENTION}

For each recommendation produce two distinct texts:
- customer_description: plain language for a vehicle owner. What was found, what the recommended work addresses, what happens if it waits — factual, calm, no pricing, no guarantee, no scare wording.
- internal_notes: technician shorthand: scope of work and anything to verify.
priority: urgent (safety or imminent failure documented) | recommended | monitor.
Return 1–5 recommendations, or an empty array if the findings do not support any.

Reply with ONLY this json object:
{"recommendations":[{"title":string,"customer_description":string,"internal_notes":string,"priority":"urgent"|"recommended"|"monitor"}]}`,
    user: `${header}\n${input.concern ? `\n${renderConcern(input.concern)}\n` : ""}\n## Documented findings\n${input.findings}\n\nReply with the json object only.`,
    temperature: 0.25,
    maxOutputTokens: 1100,
  });

  const parsed = parseJsonObject(result.text);
  return arr(parsed['recommendations'])
    .slice(0, 5)
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      const priority = str(o['priority'], 20);
      return {
        title: str(o['title'], 160),
        customerDescription: str(o['customer_description'], 1500),
        internalNotes: str(o['internal_notes'], 1200),
        priority: (["urgent", "recommended", "monitor"] as string[]).includes(priority)
          ? (priority as RecommendationDraft["priority"])
          : "recommended",
      };
    })
    .filter((r) => r.title);
}

/* ------------------------------------------------------- closeout drafting */

export type CloseoutDraft = {
  confirmedCause: string;
  repairPerformed: string;
  verification: string;
  outcome: string;
  customerSummary: string;
};

/** Drafts a per-concern closeout from what is already documented on the job. */
export async function draftCloseout(input: {
  client: Client;
  requestId: string;
  concern: ConcernRow;
  documented: string;
}): Promise<CloseoutDraft> {
  const header = await vehicleHeader(input.client, input.requestId);
  const result = await runJsonCompletion({
    system: `You draft the closeout record for ONE concern on a repair order. ${NO_INVENTION}

- repair_performed: only work the input says was actually performed. If none, "".
- verification: how the repair was verified (road test, re-scan, re-measure) — only if the input shows it.
- outcome: one of resolved | not_resolved | not_yet_known | unable_to_verify | deferred | further_diagnosis | monitor | inspection_only. Choose not_yet_known when the input does not show verification.
- customer_summary: 2–4 plain sentences a vehicle owner would understand: what they reported, what was found, what was done, how it was checked.

Reply with ONLY this json object:
{"confirmed_cause":string,"repair_performed":string,"verification":string,"outcome":string,"customer_summary":string}`,
    user: `${header}\n\n${renderConcern(input.concern)}\n\n## Everything documented on this concern\n${input.documented}\n\nReply with the json object only.`,
    temperature: 0.2,
    maxOutputTokens: 900,
  });

  const parsed = parseJsonObject(result.text);
  const outcomes = [
    "resolved",
    "not_resolved",
    "not_yet_known",
    "unable_to_verify",
    "deferred",
    "further_diagnosis",
    "monitor",
    "inspection_only",
  ];
  const outcome = str(parsed['outcome'], 30);
  return {
    confirmedCause: str(parsed['confirmed_cause'], 1500),
    repairPerformed: str(parsed['repair_performed'], 1500),
    verification: str(parsed['verification'], 1000),
    outcome: outcomes.includes(outcome) ? outcome : "not_yet_known",
    customerSummary: str(parsed['customer_summary'], 1500),
  };
}
