/**
 * Customer-side intake assistance (SERVER ONLY).
 *
 * Repara AI interviews the customer the way an experienced dealership SERVICE
 * ADVISOR would before a repair order reaches a technician: it classifies the
 * concern, works through the relevant pre-check dimensions from a structured
 * playbook, adapts to each answer, and stops as soon as the intake is useful.
 *
 * It never diagnoses, never names a failed part, never prices anything, and it
 * never writes to the database — answers travel with the submission.
 *
 * Provider-agnostic: the only AI dependency is `runJsonCompletion`.
 */

import { parseJsonObject, ReparaAiError, runJsonCompletion } from "./provider.server";
import type { IntakeContext, IntakeFollowup, IntakeQuestion, IntakeRound } from "./intake-types";
import { guessFamilies, isComplaintFamily, PLAYBOOKS, FAMILY_LIST } from "./playbooks";

const MAX_QUESTIONS_PER_ROUND = 3;
const MAX_OPTIONS = 8;
/** Room for the appended "Other" / "not sure" options beyond the model's list. */
const HARD_OPTION_LIMIT = 10;
/** Hard ceiling on the whole interview — professional intake, not a survey. */
export const MAX_TOTAL_QUESTIONS = 6;

const OTHER_RE = /^(other|others|something else|other\b.*|otro|otra|otro.*|algo m[aá]s)$/i;
const OTHER_LOOSE = /other|something else|otro|otra|algo m[aá]s/i;

function systemPrompt(families: string[], language: "en" | "es", round: number): string {
  const playbooks = families
    .filter(isComplaintFamily)
    .map((f) => PLAYBOOKS[f])
    .join("\n\n");

  const base = `You are Repara, a friendly and sharp car expert figuring out a car problem together with a normal car owner (not a mechanic). You are talking directly to them. Sound like a helpful person, never like a dealership questionnaire or diagnostic form.

YOUR JOB: gather the information a TECHNICIAN would want obtained from the customer BEFORE diagnosis begins. You are NOT the technician.

Never do these things:
- Never diagnose, never name a failed part as fact, never speculate about a cause, never say whether the vehicle is safe to drive, never mention price, cost or repair time.
- Never ask for information already supplied (vehicle, mileage, VIN, selected services, previous answers, contact details) and never ask for personal or contact information.
- Never use technician jargon unexplained. Bad: "Is NVH frequency proportional to engine RPM?" Good: "Does the humming get louder as the engine revs higher?"

- Never ask the customer to "describe in your own words" or restate a concern they already described or selected.
- Never ask generic questions that do not fit THIS concern (e.g. "when does it happen: braking / high speed" for a warning light). Every question must obviously relate to what they told you.
- Never show or mention internal categories.

HOW TO WORK:
1. Classify the customer's concern into one or more complaint families: ${FAMILY_LIST}. The customer must never have to know the category. If the customer describes TWO concerns (e.g. a noise AND a warning light), treat them as separate concerns and tag every question with its own concern; never mix their answers.
2. Use the matching service-advisor playbook below and pick only the dimensions that would meaningfully help reproduce, narrow or document THIS concern. Ask nothing that would not help.
3. Ask at most ${round === 1 ? 2 : MAX_QUESTIONS_PER_ROUND} questions in this round (the next question can depend on these answers, so ask the most important ones first and leave the rest for the next round), in priority order (highest value first). This is round ${round}; the whole interview must stay at about 3-6 focused questions for a diagnostic concern, fewer for simple ones.
4. If the customer already knows exactly what they want (e.g. "I need an oil change"), ask nothing: return needs_follow_up false.
5. If the customer has repeatedly answered "not sure", stop asking: return needs_follow_up false.
6. Stop as soon as a technician would have enough useful triage context. Set may_continue true only when a further round, based on the answers you expect, would genuinely add value.

ANSWER TYPES:
- single_choice: 2-5 short, concrete options.
- multi_choice: when several conditions can legitimately apply at once (e.g. "when does it happen?").
- yes_no: simple confirmations.
- text: only when a short free description is genuinely better (e.g. the exact dashboard message).
- Every choice question ends with a "not sure" style option — customers are allowed not to know.
- Add an "Other" option (with allow_other true and a short other_prompt such as "Describe the sound in your own words") whenever the option list may not cover the customer's experience.

PLAYBOOK GUIDANCE FOR THIS REQUEST:
${playbooks || PLAYBOOKS.other}

Reply with ONLY a json object of this exact shape:
{"concerns":[{"family":string,"label":string}],"needs_follow_up":boolean,"may_continue":boolean,"questions":[{"question":string,"answer_type":"single_choice"|"multi_choice"|"yes_no"|"text","options":[string],"allow_other":boolean,"other_prompt":string,"category":string,"concern":string}]}
"concern" is the family key from the list above. "category" is a short snake_case dimension label such as sound_type, sound_location, when_it_occurs, speed_effect, rpm_effect, temperature, road_surface, frequency, warning_light_state, fluid_color, service_history, general.`;

  if (language === "es") {
    return `${base}

IMPORTANT: The customer's selected language is Spanish. Write every question, option, other_prompt and concern label in natural, professional Latin American automotive Spanish — never a literal translation of English shop phrases. Understand the customer's input in English or Spanish. The "not sure" option must read like "No estoy seguro", and the "Other" option like "Otro — descríbelo".`;
  }
  return base;
}

function line(label: string, value: unknown) {
  const text = String(value ?? "").trim();
  return text ? `${label}: ${text}` : null;
}

/** Compact prompt text. Only intake-relevant values — no contact details. */
function buildContextText(context: IntakeContext): string {
  const v = context.vehicle ?? {};
  const services = (context.services ?? [])
    .slice(0, 8)
    .map((s) => {
      const answers = (s.answers ?? []).filter(Boolean).slice(0, 12).join(", ");
      return answers ? `${s.label} (${answers})` : s.label;
    })
    .join(" | ");

  return [
    line("Vehicle", [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")),
    line("Engine", v.engine),
    line("Drivetrain", v.drivetrain),
    line("VIN", v.hasVin ? "provided" : null),
    line("Mileage", context.mileage),
    line("Requested services and answers", services),
    line("Customer's own description (verbatim)", (context.notes ?? "").slice(0, 1200)),
    (context.previousAnswers ?? []).length
      ? `Already answered (never re-ask these):\n${(context.previousAnswers ?? [])
          .slice(0, 12)
          .map((a) => `- ${a.question} -> ${a.answer}`)
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const NOT_SURE_EN = /not sure|don'?t know|unsure|skip/i;
const NOT_SURE_ES = /no estoy segur|no s[eé]|no lo s[eé]|omitir/i;

function normalizeQuestions(
  raw: string,
  language: "en" | "es",
  round: number,
): { questions: IntakeQuestion[]; mayContinue: boolean } {
  const parsed = parseJsonObject(raw);
  const list = Array.isArray(parsed['questions']) ? (parsed['questions'] as unknown[]) : [];
  const mayContinue = parsed['may_continue'] === true;
  if (parsed['needs_follow_up'] === false && list.length === 0) return { questions: [], mayContinue: false };

  const concerns = Array.isArray(parsed['concerns']) ? (parsed['concerns'] as unknown[]) : [];
  const labels = new Map<string, string>();
  concerns.forEach((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const family = String(o['family'] ?? "").trim();
    const label = String(o['label'] ?? "").trim().slice(0, 60);
    if (family && label) labels.set(family, label);
  });

  const notSureLabel = language === "es" ? "No estoy seguro" : "I'm not sure";
  const otherLabel = language === "es" ? "Otro — descríbelo" : "Other — please describe";
  const defaultOtherPrompt =
    language === "es" ? "Descríbelo en tus propias palabras" : "Describe it in your own words";

  const questions: IntakeQuestion[] = [];

  list.slice(0, MAX_QUESTIONS_PER_ROUND).forEach((item, index) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const question = String(o['question'] ?? "").trim().slice(0, 220);
    if (question.length < 6) return;

    const rawType = String(o['answer_type'] ?? "").trim();
    let answerType: IntakeQuestion["answerType"] =
      rawType === "yes_no"
        ? "yes_no"
        : rawType === "text" || rawType === "free_text"
          ? "text"
          : rawType === "multi_choice" || rawType === "multi_select"
            ? "multi_choice"
            : "single_choice";

    let options = Array.isArray(o['options'])
      ? (o['options'] as unknown[])
          .map((x) => String(x ?? "").trim().slice(0, 90))
          .filter(Boolean)
          .slice(0, MAX_OPTIONS)
      : [];

    if (answerType === "yes_no") {
      options = language === "es" ? ["Sí", "No"] : ["Yes", "No"];
    }
    if ((answerType === "single_choice" || answerType === "multi_choice") && options.length < 2) {
      // Unusable choice list — a short text answer is still useful.
      answerType = "text";
      options = [];
    }

    let allowOther = false;
    if (answerType === "single_choice" || answerType === "multi_choice") {
      // Any "Other"-style option MUST reveal a free-text field in the UI.
      const hasOther = options.some((x) => OTHER_RE.test(x) || OTHER_LOOSE.test(x));
      allowOther = hasOther || o['allow_other'] === true;
      if (allowOther && !hasOther && options.length < HARD_OPTION_LIMIT) options.push(otherLabel);

      const hasNotSure = options.some((x) => NOT_SURE_EN.test(x) || NOT_SURE_ES.test(x));
      if (!hasNotSure && options.length < HARD_OPTION_LIMIT) options.push(notSureLabel);
    }

    const concern = String(o['concern'] ?? "").trim().toLowerCase();

    questions.push({
      id: `r${round}q${index + 1}`,
      question,
      answerType,
      options,
      category:
        String(o['category'] ?? "general")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, "_")
          .slice(0, 40) || "general",
      ...(isComplaintFamily(concern) ? { concern } : {}),
      ...(labels.get(concern) ? { concernLabel: labels.get(concern)! } : {}),
      ...(allowOther
        ? {
            allowOther: true,
            otherPrompt: String(o['other_prompt'] ?? "").trim().slice(0, 120) || defaultOtherPrompt,
          }
        : {}),
    });
  });

  return { questions, mayContinue: mayContinue && questions.length > 0 };
}

/**
 * Generates one round of service-advisor follow-up questions.
 * Any AI problem returns an empty list — the form must always remain usable.
 */
export async function generateIntakeQuestions(context: IntakeContext): Promise<IntakeRound> {
  const round = Math.max(1, Math.min(3, context.round ?? 1));
  const answered = (context.previousAnswers ?? []).length;
  if (answered >= MAX_TOTAL_QUESTIONS) return { questions: [], mayContinue: false, degraded: false };

  const contextText = buildContextText(context);
  // Nothing meaningful to reason about yet: don't spend a model call.
  if (contextText.length < 24) return { questions: [], mayContinue: false, degraded: false };

  // Deterministic pre-classification keeps the prompt (and cost) small by
  // sending only the relevant playbooks.
  const complaintText = [
    context.notes ?? "",
    ...(context.services ?? []).map((s) => `${s.label} ${s.answers.join(" ")}`),
    ...(context.previousAnswers ?? []).map((a) => `${a.question} ${a.answer}`),
  ].join(" ");
  const families = guessFamilies(complaintText, context.serviceKeys ?? []);

  // The customer keeps saying "not sure" — stop interviewing them.
  const unsureCount = (context.previousAnswers ?? []).filter(
    (a) => NOT_SURE_EN.test(a.answer) || NOT_SURE_ES.test(a.answer) || !a.answer.trim(),
  ).length;
  if (answered > 0 && unsureCount >= Math.ceil(answered / 2) && unsureCount >= 2) {
    return { questions: [], mayContinue: false, degraded: false };
  }

  try {
    const { text } = await runJsonCompletion({
      system: systemPrompt(families, context.language, round),
      user: `Here is what the customer has told us so far. Classify the concern(s), then ask only the highest-value service-advisor questions that are still missing. Reply with the json object only.\n\n${contextText}`,
      maxOutputTokens: 900,
      temperature: 0.3,
    });
    const { questions, mayContinue } = normalizeQuestions(text, context.language, round);
    const remaining = MAX_TOTAL_QUESTIONS - answered - questions.length;
    return { questions, mayContinue: mayContinue && remaining > 0 && round < 3, degraded: false };
  } catch (error) {
    if (error instanceof ReparaAiError) {
      console.error("[repara-ai] intake questions unavailable:", error.kind, error.message);
    } else {
      console.error("[repara-ai] intake questions failed", error);
    }
    // AI is never required to submit a request.
    return { questions: [], mayContinue: false, degraded: true };
  }
}

/* --------------------------- concern summarisation -------------------------- */

/** Deterministic fallback: pure restatement of what the customer reported. */
export function fallbackSummary(followups: IntakeFollowup[], language: "en" | "es"): string {
  const answered = followups.filter((f) => !f.skipped && f.answer.trim());
  if (answered.length === 0) return "";
  const lead = language === "es" ? "El cliente reporta:" : "Customer reports:";
  return `${lead} ${answered
    .map((f) => `${f.question} — ${f.answer}${f.otherText ? ` (${f.otherText})` : ""}`)
    .join("; ")}`;
}

/**
 * Turns the customer's OWN reported information into a short service-advisor
 * style concern statement for the admin/technician. It restates; it never adds
 * a cause the customer did not report. The original wording is preserved
 * separately by the caller.
 */
export async function summarizeIntake(input: {
  language: "en" | "es";
  notes?: string;
  services: string[];
  followups: IntakeFollowup[];
}): Promise<{ summary: string; degraded: boolean }> {
  const answered = input.followups.filter((f) => !f.skipped && f.answer.trim());
  if (answered.length === 0) return { summary: "", degraded: false };

  const body = [
    input.notes ? `Customer's own words: ${input.notes.slice(0, 1000)}` : null,
    input.services.length ? `Requested services: ${input.services.join(", ")}` : null,
    `Intake answers:\n${answered
      .map(
        (f) =>
          `- [${f.concern ?? "general"}/${f.category}] ${f.question} -> ${f.answer}${
            f.otherText ? ` (${f.otherText})` : ""
          }`,
      )
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text } = await runJsonCompletion({
      system: `You write the "customer concern" section of a repair order for a dealership service advisor. The reader is a technician.

Rules:
- Restate ONLY what the customer reported. Never add a cause, a suspected part, a diagnosis, a price or a safety judgement.
- Write in English regardless of the customer's language (the admin dashboard is English), 1-3 sentences, factual advisor phrasing such as "Customer reports…".
- When the customer described more than one concern, write one short sentence per concern, kept separate.
- Never invent details that are not in the answers.

Reply with ONLY a json object: {"summary":string}`,
      user: body,
      maxOutputTokens: 300,
      temperature: 0.1,
    });
    const parsed = parseJsonObject(text);
    const summary = String(parsed['summary'] ?? "").trim().slice(0, 1000);
    return summary
      ? { summary, degraded: false }
      : { summary: fallbackSummary(input.followups, input.language), degraded: true };
  } catch (error) {
    console.error("[repara-ai] intake summary unavailable", error);
    return { summary: fallbackSummary(input.followups, input.language), degraded: true };
  }
}
