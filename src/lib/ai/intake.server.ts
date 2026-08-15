/**
 * Customer-side intake assistance (SERVER ONLY).
 *
 * Turns the information a customer has already given into 1–3 useful follow-up
 * questions, the way an experienced service advisor would. It never diagnoses,
 * never prices, never promises anything, and it never writes to the database:
 * the answers travel with the submission and are persisted there.
 *
 * Provider-agnostic: the only AI dependency is `runJsonCompletion`.
 */

import { parseJsonObject, ReparaAiError, runJsonCompletion } from "./provider.server";
import type { IntakeContext, IntakeQuestion } from "./intake-types";

const MAX_QUESTIONS = 3;
const MAX_OPTIONS = 6;

const SYSTEM_EN = `You are an experienced automotive service advisor taking in a customer's mobile-service request for Repara.

Your only job is to ask the few follow-up questions that would materially improve the request before a technician reviews it. You are talking directly to the customer.

Hard rules:
- Ask at most 3 questions, fewer when the request is already clear. Ask 0 questions when nothing useful is missing.
- Never diagnose, never name a failed part as fact, never speculate about cause, never say whether the vehicle is safe to drive, never mention price, cost or repair time.
- Never ask for information already supplied (vehicle, mileage, VIN, selected services, existing answers, contact details).
- Never ask for personal or contact information.
- Plain, friendly, non-technical wording. One short question at a time. No jargon the customer would need to look up.
- Customers are allowed not to know: every choice question must include a "not sure" style option as its last option.
- Prefer single_choice with 2-5 short concrete options. Use yes_no for simple confirmations, and text only when a short description is genuinely better.
- Good areas to clarify: where/when a symptom happens, cold start vs every start, how a noise would be described, fluid colour and location, which warning light and whether it flashes, when vibration occurs, whether temperature or fluid loss was noticed, which fluids were serviced before and roughly when.

Reply with ONLY a json object of this exact shape:
{"needs_follow_up":boolean,"questions":[{"question":string,"answer_type":"single_choice"|"yes_no"|"text","options":[string],"category":string}]}
category is a short snake_case label such as fluid_leak, startup_noise, warning_light, vibration, overheating, fluid_history, brake_concern, general.`;

const SYSTEM_ES = `${SYSTEM_EN}

IMPORTANT: The customer's selected interface language is Spanish. Write every question, every option and every category-facing text in natural, professional Latin American Spanish for automotive service. Understand the customer's input in either English or Spanish. The "not sure" option must read like "No estoy seguro".`;

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
    line("Customer's own description", (context.notes ?? "").slice(0, 1200)),
    (context.previousAnswers ?? []).length
      ? `Already answered:\n${(context.previousAnswers ?? [])
          .slice(0, 8)
          .map((a) => `- ${a.question} -> ${a.answer}`)
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const NOT_SURE_EN = /not sure|don'?t know|unsure|skip/i;
const NOT_SURE_ES = /no estoy segur|no s[eé]|no lo s[eé]|omitir/i;

function validateQuestions(raw: string, language: "en" | "es"): IntakeQuestion[] {
  const parsed = parseJsonObject(raw);
  const list = Array.isArray(parsed['questions']) ? (parsed['questions'] as unknown[]) : [];
  if (parsed['needs_follow_up'] === false && list.length === 0) return [];

  const notSureLabel = language === "es" ? "No estoy seguro" : "I'm not sure";
  const questions: IntakeQuestion[] = [];

  list.slice(0, MAX_QUESTIONS).forEach((item, index) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const question = String(o['question'] ?? "").trim().slice(0, 220);
    if (question.length < 6) return;

    const rawType = String(o['answer_type'] ?? "").trim();
    let answerType: IntakeQuestion["answerType"] =
      rawType === "yes_no" ? "yes_no" : rawType === "text" ? "text" : "single_choice";

    let options = Array.isArray(o['options'])
      ? (o['options'] as unknown[])
          .map((x) => String(x ?? "").trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, MAX_OPTIONS)
      : [];

    if (answerType === "yes_no") {
      options = language === "es" ? ["Sí", "No"] : ["Yes", "No"];
    }
    if (answerType === "single_choice" && options.length < 2) {
      // Unusable choice list — a short text answer is still useful.
      answerType = "text";
      options = [];
    }
    if (answerType !== "text") {
      const hasNotSure = options.some((x) => NOT_SURE_EN.test(x) || NOT_SURE_ES.test(x));
      if (!hasNotSure && options.length < MAX_OPTIONS) options.push(notSureLabel);
    }

    questions.push({
      id: `q${index + 1}`,
      question,
      answerType,
      options,
      category: String(o['category'] ?? "general")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .slice(0, 40) || "general",
    });
  });

  return questions;
}

/**
 * Generates the customer-facing follow-up questions for one intake snapshot.
 * Any AI problem returns an empty list — the form must always remain usable.
 */
export async function generateIntakeQuestions(
  context: IntakeContext,
): Promise<{ questions: IntakeQuestion[]; degraded: boolean }> {
  const contextText = buildContextText(context);
  // Nothing meaningful to reason about yet: don't spend a model call.
  if (contextText.length < 24) return { questions: [], degraded: false };

  try {
    const { text } = await runJsonCompletion({
      system: context.language === "es" ? SYSTEM_ES : SYSTEM_EN,
      user: `Here is what the customer has told us so far. Decide whether follow-up questions would materially help, then reply with the json object only.\n\n${contextText}`,
      maxOutputTokens: 700,
      temperature: 0.3,
    });
    return { questions: validateQuestions(text, context.language), degraded: false };
  } catch (error) {
    if (error instanceof ReparaAiError) {
      console.error("[repara-ai] intake questions unavailable:", error.kind, error.message);
    } else {
      console.error("[repara-ai] intake questions failed", error);
    }
    // AI is never required to submit a request.
    return { questions: [], degraded: true };
  }
}
