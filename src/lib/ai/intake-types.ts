/**
 * Shared (client-safe) shapes for AI-assisted customer intake.
 *
 * These types are provider-agnostic on purpose: they describe Repara's own
 * intake contract, so swapping the AI vendor never changes the customer UI,
 * the stored data, or the admin view.
 */

export type IntakeAnswerType = "text" | "single_choice" | "multi_choice" | "yes_no";

export type IntakeQuestion = {
  /** Stable id for this question within one intake session. */
  id: string;
  question: string;
  answerType: IntakeAnswerType;
  /** Selectable chips for choice questions. Always includes a "not sure" style option. */
  options: string[];
  /** Loose grouping (e.g. "sound_type", "startup_noise") for later automation. */
  category: string;
  /**
   * Complaint family this question belongs to (noise, warning_light, …). Kept so
   * several concerns in one request stay logically separated.
   */
  concern?: string;
  /** Short customer-facing label for the concern, in the customer's language. */
  concernLabel?: string;
  /** True when an "Other" option must reveal a free-text field. */
  allowOther?: boolean;
  /** Prompt shown above that free-text field ("Describe the sound…"). */
  otherPrompt?: string;
};

export type IntakeFollowup = {
  questionId: string;
  question: string;
  /** Selected option(s) joined with ", ", or the customer's own text. */
  answer: string;
  category: string;
  /** True when the customer could not or chose not to answer. */
  skipped: boolean;
  /** Complaint family, so admins/technicians see grouped concerns. */
  concern?: string;
  /** Free text typed after choosing an "Other" option. */
  otherText?: string;
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
  /** Service-catalog keys, used for cheap deterministic pre-classification. */
  serviceKeys?: string[];
  /** Which interview round this is (1 = first questions). */
  round?: number;
};

/** One round of adaptive intake. */
export type IntakeRound = {
  questions: IntakeQuestion[];
  /** True when the advisor logic thinks another round could still add value. */
  mayContinue: boolean;
  degraded: boolean;
};
