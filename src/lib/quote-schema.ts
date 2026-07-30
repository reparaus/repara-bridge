import { z } from "zod";

/** Shared quote-request shape used by the customer form and the server function. */

/** Answers to a service's conditional questions: choice ids or free text. */
export const serviceAnswersSchema = z.record(
  z.string().max(40),
  z.union([z.string().max(2000), z.array(z.string().max(80)).max(20)]),
);

export const serviceSelectionSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  answers: serviceAnswersSchema.default({}),
});

export const drivetrainSchema = z.enum(["fwd", "rwd", "awd", "4wd", "unknown"]);
export const configSourceSchema = z.enum(["vin", "customer"]);

export const quoteRequestSchema = z.object({
  vehicle: z.object({
    /** How the customer identified the vehicle — kept for data quality. */
    entryMethod: z.enum(["vin", "manual"]).default("manual"),
    vin: z
      .string()
      .trim()
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Invalid VIN")
      .optional()
      .or(z.literal("")),
    year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2),
    make: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    trim: z.string().trim().max(80).optional().or(z.literal("")),
    /**
     * Structured configuration used for parts accuracy, labor estimates and
     * fluid specs. Each value records whether it came from the VIN decode or
     * from the customer, so we never re-ask something already confirmed.
     */
    engineDisplacement: z.coerce.number().min(0).max(12).optional(),
    engineCode: z.string().trim().max(40).optional().or(z.literal("")),
    cylinderCount: z.coerce.number().int().min(1).max(16).optional(),
    fuelType: z.string().trim().max(30).optional().or(z.literal("")),
    isHybrid: z.boolean().optional(),
    drivetrain: drivetrainSchema.default("unknown"),
    bodyType: z.string().trim().max(60).optional().or(z.literal("")),
    engineSource: configSourceSchema.optional(),
    drivetrainSource: configSourceSchema.optional(),
  }),

  /** Multi-select: one quote request can contain several services. */
  services: z.array(serviceSelectionSchema).min(1, "Choose at least one service").max(8),
  details: z.object({
    /** Mileage reported AT THE TIME of this request (never a static value). */
    mileage: z.coerce.number().int().min(0).max(2_000_000),
    zipCode: z
      .string()
      .trim()
      .regex(/^\d{5}(-\d{4})?$/, "Enter a valid ZIP code"),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    photoPaths: z.array(z.string().max(300)).max(8).default([]),
  }),
  contact: z
    .object({
      firstName: z.string().trim().min(1, "First name is required").max(60),
      lastName: z.string().trim().max(60).optional().or(z.literal("")),
      phone: z
        .string()
        .trim()
        .regex(/^[0-9+()\-.\s]{7,20}$/, "Enter a valid phone number")
        .optional()
        .or(z.literal("")),
      email: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
      preferredContactMethod: z.enum(["text", "call", "email"]).default("text"),
    })
    .superRefine((c, ctx) => {
      const needsPhone = c.preferredContactMethod === "text" || c.preferredContactMethod === "call";
      if (needsPhone && !c.phone) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: "Add a mobile number so we can reach you.",
        });
      }
      if (c.preferredContactMethod === "email" && !c.email) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "Add an email address so we can send your quote.",
        });
      }
    }),
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
export type ServiceSelection = z.infer<typeof serviceSelectionSchema>;
