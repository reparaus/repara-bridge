/**
 * Shared (client-safe) shapes for AI-assisted customer intake.
 *
 * These types are provider-agnostic on purpose: they describe Repara's own
 * intake contract, so swapping the AI vendor never changes the customer UI,
 * the stored data, or the admin view.
 */

export type IntakeAnswerType = "text" | "single_choice" | "yes_no";

export type IntakeQuestion = {
  /** Stable id for this question within one intake session. */
  id: string;
  question: string;
  answerType: IntakeAnswerType;
  /** Selectable chips for choice questions. Always includes a "not sure" style option. */
  options: string[];
  /** Loose grouping (e.g. "fluid_leak", "startup_noise") for later automation. */
  category: string;
};

export type IntakeFollowup = {
  questionId: string;
  question: string;
  answer: string;
  category: string;
  /** True when the customer could not or chose not to answer. */
  skipped: boolean;
};

/** Language of the customer-facing experience. Admin UI stays English. */
export type IntakeLanguage = "en" | "es";

/** Everything the AI is allowed to see. Contact details are deliberately absent. */
export type IntakeContext = {
  language: IntakeLanguage;
  vehicle: {
    year?: number | string;
    make?: string;
    model?: string;
    trim?: string;
    engine?: string;
    drivetrain?: string;
    hasVin?: boolean;
  };
  mileage?: string;
  services: { label: string; answers: string[] }[];
  notes?: string;
  /** Answers already given to earlier AI follow-ups, so nothing is re-asked. */
  previousAnswers?: { question: string; answer: string }[];
};
