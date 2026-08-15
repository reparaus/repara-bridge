import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { IntakeQuestion } from "@/lib/ai/intake-types";

/**
 * Public server function powering AI-assisted customer intake.
 *
 * It is intentionally read-only: it never writes to the database, never sees
 * contact details, and returns an empty question list on any AI failure so the
 * quote form always stays usable. The AI never diagnoses or prices anything.
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
  notes: z.string().trim().max(2000).optional(),
  previousAnswers: z
    .array(z.object({ question: z.string().max(400), answer: z.string().max(1000) }))
    .max(6)
    .optional(),
});

export const requestIntakeQuestions = createServerFn({ method: "POST" })
  .inputValidator((data) => contextSchema.parse(data))
  .handler(async ({ data }): Promise<{ questions: IntakeQuestion[]; degraded: boolean }> => {
    const { generateIntakeQuestions } = await import("@/lib/ai/intake.server");
    return generateIntakeQuestions(data);
  });
