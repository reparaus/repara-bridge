/**
 * Language-aware accessors for the service catalog.
 *
 * `src/lib/services.ts` stays the structural source of truth (keys, kinds,
 * stored values); these helpers only swap the display text.
 */
import {
  PHOTO_PROMPTS,
  SERVICE_QUESTIONS,
  SERVICES,
  answerLabel,
  serviceLabel,
  type Choice,
  type ServiceKey,
  type ServiceQuestion,
} from "@/lib/services";

import { PHOTO_PROMPTS_ES, QUESTION_ES, SERVICE_ES, VEHICLE_OPTION_ES } from "./catalog-es";
import type { Language } from "./index";

export function localizedServiceLabel(key: string, lang: Language): string {
  if (lang === "es" && key in SERVICE_ES) return SERVICE_ES[key as ServiceKey].label;
  return serviceLabel(key);
}

export function localizedServiceBlurb(key: ServiceKey, lang: Language): string {
  if (lang === "es" && key in SERVICE_ES) return SERVICE_ES[key].blurb;
  return SERVICES.find((s) => s.key === key)?.blurb ?? "";
}

/** Returns the question with label/hint/placeholder/options in `lang`. */
export function localizedQuestion(
  serviceKey: ServiceKey,
  question: ServiceQuestion,
  lang: Language,
): ServiceQuestion {
  if (lang !== "es") return question;
  const tr = QUESTION_ES[`${serviceKey}.${question.id}`];
  if (!tr) return question;
  const options: Choice[] | undefined = question.options?.map((o) => ({
    value: o.value,
    label: tr.options?.[o.value] ?? o.label,
  }));
  return {
    ...question,
    label: tr.label ?? question.label,
    ...(tr.hint || question.hint ? { hint: tr.hint ?? question.hint } : {}),
    ...(tr.placeholder || question.placeholder
      ? { placeholder: tr.placeholder ?? question.placeholder }
      : {}),
    ...(options ? { options } : {}),
  };
}

export function localizedQuestions(serviceKey: ServiceKey, lang: Language): ServiceQuestion[] {
  return (SERVICE_QUESTIONS[serviceKey] ?? []).map((q) => localizedQuestion(serviceKey, q, lang));
}

export function localizedAnswerLabel(
  serviceKey: string,
  questionId: string,
  value: string,
  lang: Language,
): string {
  if (lang === "es") {
    const tr = QUESTION_ES[`${serviceKey}.${questionId}`];
    const label = tr?.options?.[value];
    if (label) return label;
  }
  return answerLabel(serviceKey, questionId, value);
}

export function localizedPhotoPrompt(key: ServiceKey, lang: Language): string | undefined {
  if (lang === "es") return PHOTO_PROMPTS_ES[key] ?? PHOTO_PROMPTS[key];
  return PHOTO_PROMPTS[key];
}

/** Vehicle-config option labels (engine / drivetrain) that aren't free text. */
export function localizedVehicleOption(value: string, label: string, lang: Language): string {
  if (lang !== "es") return label;
  return VEHICLE_OPTION_ES[value] ?? VEHICLE_OPTION_ES[label.toLowerCase()] ?? label;
}
