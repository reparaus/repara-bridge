/**
 * Repara AI — technician copilot (SERVER ONLY).
 *
 * The copilot answers a technician's question about ONE job with the job
 * context already attached, so nobody re-types "2021 Lexus RX350, 62k miles".
 *
 * Two hard rules are enforced here rather than trusted to the model prompt
 * alone:
 *   1. Technical-information integrity — every answer carries a verification
 *      level, and specification-type answers are labelled UNVERIFIED until an
 *      authorized service-data source is connected (see `SPEC_SOURCES`).
 *   2. Nothing here is customer-facing and nothing changes job state. Findings,
 *      recommendations and status changes are always an explicit human action.
 */

import { parseJsonObject, runJsonCompletion, ReparaAiError } from "@/lib/ai/provider.server";
import {
  assembleJobContext,
  contextDigest,
  renderJobContext,
  DIAGNOSTIC_SCOPE,
  FULL_SCOPE,
  type JobContextScope,
} from "./job-context.server";

/**
 * Authorized technical-data sources currently connected. Empty means Repara has
 * no licensed service information yet, so specifications, torque values,
 * capacities and procedures must be reported as unverified. Wiring a licensed
 * provider later = adding it here plus a lookup step; no UI redesign.
 */
export const SPEC_SOURCES: { id: string; label: string }[] = [];

export type CopilotAction =
  | "ask"
  | "diagnose"
  | "next_test"
  | "explain_dtc"
  | "find_procedure"
  | "specs"
  | "reset_relearn"
  | "summarize_job"
  | "draft_finding"
  | "draft_recommendation";

/** Quick actions the Job Workspace shows. Each one is a real AI workflow. */
export const QUICK_ACTIONS: {
  action: CopilotAction;
  label: string;
  prompt: string;
  needsInput?: string;
}[] = [
  { action: "diagnose", label: "Diagnose concern", prompt: "Evaluate this concern and give likely causes, why each fits, a test order, and what information is still missing." },
  { action: "next_test", label: "What should I test next?", prompt: "Based on everything already documented, what is the single most logical next diagnostic step, and what result would confirm or rule out each cause?" },
  { action: "explain_dtc", label: "Explain DTC", prompt: "Explain this DTC in the context of this vehicle and what has already been documented.", needsInput: "Which code? (e.g. P0301)" },
  { action: "find_procedure", label: "Find procedure", prompt: "Outline the general procedure for this job on this vehicle, and state clearly what must be confirmed against authorized service information.", needsInput: "Which procedure?" },
  { action: "specs", label: "Fluid / specs", prompt: "What specification is being asked for, what is the typical range for this type of vehicle, and what must be verified against authorized service data?", needsInput: "Which spec? (fluid type, capacity, torque…)" },
  { action: "reset_relearn", label: "Reset / relearn", prompt: "Describe the reset or relearn procedure normally required here and what must be verified against authorized service data.", needsInput: "Which reset or relearn?" },
  { action: "summarize_job", label: "Summarize job", prompt: "Summarize this job for a technician taking over: concern, what has been done, what is confirmed, what is still open." },
  { action: "draft_finding", label: "Draft finding", prompt: "Turn what has been documented into one concise, factual technician finding. Do not state anything that was not documented.", needsInput: "What did you find?" },
  { action: "draft_recommendation", label: "Draft recommendation", prompt: "Draft a plain-language, customer-friendly explanation of this recommended work. No pricing, no safety guarantees.", needsInput: "What are you recommending?" },
];

/** Actions that ask for manufacturer data — the integrity-critical ones. */
const SPEC_ACTIONS = new Set<CopilotAction>(["specs", "find_procedure", "reset_relearn"]);

const SCOPE_BY_ACTION: Record<CopilotAction, JobContextScope[]> = {
  ask: FULL_SCOPE,
  diagnose: DIAGNOSTIC_SCOPE,
  next_test: DIAGNOSTIC_SCOPE,
  explain_dtc: DIAGNOSTIC_SCOPE,
  find_procedure: ["vehicle", "concern", "stage"],
  specs: ["vehicle"],
  reset_relearn: ["vehicle", "diagnostics"],
  summarize_job: FULL_SCOPE,
  draft_finding: DIAGNOSTIC_SCOPE,
  draft_recommendation: ["vehicle", "concern", "findings", "diagnostics"],
};

export type CopilotAnswer = {
  answer: string;
  likelyCauses: { cause: string; why: string; test: string }[];
  nextSteps: string[];
  missingInfo: string[];
  /**
   * reasoning  = inference from general automotive knowledge
   * job_data   = grounded in what is documented on this job
   * unverified = would need authorized service information to trust
   */
  verification: "job_data" | "reasoning" | "unverified";
  caveats: string;
  suggestedFinding: { title: string; detail: string } | null;
  suggestedRecommendation: { title: string; customerDescription: string; priority: string } | null;
};

const SYSTEM_PROMPT = `You are Repara AI, assisting a PROFESSIONAL automotive technician who is working on a specific vehicle right now.

Audience and tone:
- Talk to a technician, not a consumer. Prioritize diagnostic reasoning and actionable next steps over general explanations.
- Be concise. No filler, no safety lectures, no "consult a professional".

Technical-information integrity (critical):
- NEVER invent vehicle specifications, torque values, fluid types, capacities, wiring details, pin numbers, procedures or manufacturer instructions.
- If a value or procedure would need authoritative service information that you were not given, say so plainly and set verification to "unverified". You may describe the general approach and what to look up, but never present a number as fact.
- Set verification to "job_data" when the answer follows from the documented job information, and "reasoning" when it is general automotive reasoning applied to this vehicle.
- Never present a cause as confirmed. Only the technician confirms a diagnosis.

Output ONLY a json object of this exact shape (use empty arrays/strings and null where not applicable):
{"answer":string,"likely_causes":[{"cause":string,"why":string,"test":string}],"next_steps":[string],"missing_info":[string],"verification":"job_data"|"reasoning"|"unverified","caveats":string,"suggested_finding":{"title":string,"detail":string}|null,"suggested_recommendation":{"title":string,"customer_description":string,"priority":"urgent"|"recommended"|"monitor"}|null}`;

function str(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function list(value: unknown, max: number, cap = 8): string[] {
  return Array.isArray(value)
    ? value.slice(0, cap).map((x) => str(x, max)).filter(Boolean)
    : [];
}

function validate(raw: string, forceUnverified: boolean): CopilotAnswer {
  const parsed = parseJsonObject(raw);
  const answer = str(parsed['answer'], 4000);
  if (!answer) throw new ReparaAiError("The AI response was empty.", "unreadable");

  const causes = Array.isArray(parsed['likely_causes'])
    ? (parsed['likely_causes'] as unknown[]).slice(0, 8).map((item) => {
        const o = (item ?? {}) as Record<string, unknown>;
        return { cause: str(o['cause'], 160), why: str(o['why'], 400), test: str(o['test'], 300) };
      }).filter((c) => c.cause)
    : [];

  const rawVerification = str(parsed['verification'], 20);
  const verification: CopilotAnswer["verification"] = forceUnverified
    ? "unverified"
    : rawVerification === "job_data" || rawVerification === "unverified"
      ? rawVerification
      : "reasoning";

  const finding = (parsed['suggested_finding'] ?? null) as Record<string, unknown> | null;
  const rec = (parsed['suggested_recommendation'] ?? null) as Record<string, unknown> | null;
  const priority = str(rec?.['priority'], 20);

  return {
    answer,
    likelyCauses: causes,
    nextSteps: list(parsed['next_steps'], 300),
    missingInfo: list(parsed['missing_info'], 240),
    verification,
    caveats: str(parsed['caveats'], 600),
    suggestedFinding:
      finding && str(finding['title'], 160)
        ? { title: str(finding['title'], 160), detail: str(finding['detail'], 800) }
        : null,
    suggestedRecommendation:
      rec && str(rec['title'], 160)
        ? {
            title: str(rec['title'], 160),
            customerDescription: str(rec['customer_description'], 900),
            priority: ["urgent", "recommended", "monitor"].includes(priority) ? priority : "recommended",
          }
        : null,
  };
}

type QueryClient = { from: (table: string) => any };

/**
 * Runs one copilot turn and persists both sides of the exchange.
 *
 * Cost control: the same action asked again against an unchanged job context
 * and an unchanged question reuses the stored answer instead of calling the
 * model. A technician can always force a fresh run.
 */
export async function runCopilot(input: {
  client: QueryClient;
  requestId: string;
  action: CopilotAction;
  question: string;
  userId: string;
  force?: boolean;
}): Promise<{ answer: CopilotAnswer; cached: boolean }> {
  const { client, requestId, action, userId } = input;
  const question = input.question.trim();

  const context = await assembleJobContext(client, requestId, SCOPE_BY_ACTION[action] ?? FULL_SCOPE);
  const rendered = renderJobContext(context);
  const digest = contextDigest(`${action}|${question}|${rendered}`);

  if (!input.force) {
    try {
      const { data } = await client
        .from("job_ai_messages")
        .select("content, payload")
        .eq("service_request_id", requestId)
        .eq("role", "assistant")
        .eq("context_digest", digest)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.payload && Object.keys(data.payload).length)
        return { answer: data.payload as CopilotAnswer, cached: true };
    } catch {
      /* copilot log unavailable — fall through to a live call */
    }
  }

  const specsUnavailable = SPEC_ACTIONS.has(action) && SPEC_SOURCES.length === 0;
  const sourceNote = specsUnavailable
    ? "\n\nNOTE: No authorized service-information source is connected to Repara. You must NOT state specifications, torque values, capacities or step-by-step manufacturer procedures as fact. Describe the general approach, name exactly what has to be looked up, and set verification to \"unverified\"."
    : "";

  const result = await runJsonCompletion({
    system: SYSTEM_PROMPT + sourceNote,
    user: `${rendered}\n\n## Technician question (${action})\n${question}\n\nReply with the json object only.`,
    temperature: 0.2,
    maxOutputTokens: 1200,
  });

  const answer = validate(result.text, specsUnavailable);

  // Best-effort logging: a missing copilot table must not lose the answer.
  try {
    await client.from("job_ai_messages").insert([
      {
        service_request_id: requestId,
        role: "technician",
        action,
        content: question,
        created_by: userId,
      },
      {
        service_request_id: requestId,
        role: "assistant",
        action,
        content: answer.answer,
        payload: answer,
        context_digest: digest,
        created_by: userId,
      },
    ]);
  } catch {
    /* ignore */
  }

  return { answer, cached: false };
}

/** Full copilot transcript for one job, oldest first. */
export async function listCopilotMessages(client: QueryClient, requestId: string) {
  try {
    const { data } = await client
      .from("job_ai_messages")
      .select("id, role, action, content, payload, created_at")
      .eq("service_request_id", requestId)
      .order("created_at", { ascending: true })
      .limit(120);
    return ((data ?? []) as Record<string, any>[]).map((m) => ({
      id: String(m['id']),
      role: String(m['role']) as "technician" | "assistant",
      action: m['action'] ? String(m['action']) : null,
      content: String(m['content'] ?? ""),
      payload: (m['payload'] ?? {}) as Partial<CopilotAnswer>,
      createdAt: String(m['created_at']),
    }));
  } catch {
    return [];
  }
}
