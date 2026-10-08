import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { IntakeRound } from "@/lib/ai/intake-types";

/**
 * Public server functions powering AI-assisted customer intake.
 *
 * They never write customer data (only a hashed-IP rate-limit counter), never see
 * contact details, and degrade to an empty result on any AI failure so the quote
 * form always stays usable. The AI never diagnoses or prices anything.
 */

const contextSchema = z.object({
  language: z.enum(["en", "es"]).default("en"),
  vehicle: z.object({
    year: z.union([z.number(), z.string()]).optional(),
    make: z.string().trim().max(60).optional(),
    model: z.string().trim().max(60).optional(),
    trim: z.string().trim().max(80).optional(),
    engine: z.string().trim().max(80).optional(),
    drivetrain: z.string().trim().max(20).optional(),
    hasVin: z.boolean().optional(),
  }),
  mileage: z.string().trim().max(20).optional(),
  services: z
    .array(
      z.object({
        label: z.string().trim().max(80),
        answers: z.array(z.string().trim().max(200)).max(20).default([]),
      }),
    )
    .max(8)
    .default([]),
  serviceKeys: z.array(z.string().trim().max(40)).max(8).default([]),
  notes: z.string().trim().max(2000).optional(),
  previousAnswers: z
    .array(z.object({ question: z.string().max(400), answer: z.string().max(1000) }))
    .max(12)
    .optional(),
  round: z.number().int().min(1).max(3).default(1),
});

export const requestIntakeQuestions = createServerFn({ method: "POST" })
  .inputValidator((data) => contextSchema.parse(data))
  .handler(async ({ data }): Promise<IntakeRound> => {
    const { consumeRateLimit, visitorKey } = await import("@/lib/rate-limit.server");
    if (!(await consumeRateLimit("intakeQuestions", await visitorKey()))) {
      return { questions: [], mayContinue: false, degraded: true };
    }
    const { generateIntakeQuestions } = await import("@/lib/ai/intake.server");
    return generateIntakeQuestions(data);
  });

const summarySchema = z.object({
  language: z.enum(["en", "es"]).default("en"),
  notes: z.string().trim().max(2000).optional(),
  services: z.array(z.string().trim().max(80)).max(8).default([]),
  followups: z
    .array(
      z.object({
        questionId: z.string().trim().max(40),
        question: z.string().trim().max(400),
        answer: z.string().trim().max(1000),
        category: z.string().trim().max(40).default("general"),
        skipped: z.boolean().default(false),
        concern: z.string().trim().max(40).optional(),
        otherText: z.string().trim().max(1000).optional(),
      }),
    )
    .max(12)
    .default([]),
});

/** Service-advisor style restatement of the customer's own reported symptoms. */
export const requestIntakeSummary = createServerFn({ method: "POST" })
  .inputValidator((data) => summarySchema.parse(data))
  .handler(async ({ data }): Promise<{ summary: string; degraded: boolean }> => {
    const { consumeRateLimit, visitorKey } = await import("@/lib/rate-limit.server");
    const { summarizeIntake, fallbackSummary } = await import("@/lib/ai/intake.server");
    if (!(await consumeRateLimit("intakeSummary", await visitorKey()))) {
      // Same no-AI restatement the form shows when the AI is unavailable.
      return { summary: fallbackSummary(data.followups, data.language), degraded: true };
    }
    return summarizeIntake(data);
  });
