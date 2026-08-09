import { z } from "zod";

/**
 * Input schemas. Shared by the client form (for inline feedback) and the server
 * action (for the decision that actually counts).
 */

/** Digits only, ignoring the usual punctuation people type into phone fields. */
const digitCount = (value: string) => (value.match(/\d/g) ?? []).length;

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .max(30, "That phone number looks too long")
  .refine((value) => /^\+?[\d\s().-]+$/.test(value), {
    message: "Use digits, spaces and + only",
  })
  .refine((value) => digitCount(value) >= 7 && digitCount(value) <= 15, {
    message: "Enter a complete phone number",
  });

export const customerDetailsSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Please enter your name")
    .max(80, "That name is too long"),
  customerEmail: z
    .email("Enter a valid email address")
    .max(160, "That email is too long")
    .transform((value) => value.trim().toLowerCase()),
  customerPhone: phoneSchema,
  notes: z
    .string()
    .trim()
    .max(500, "Please keep notes under 500 characters")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type CustomerDetails = z.infer<typeof customerDetailsSchema>;

export const createBookingSchema = customerDetailsSchema.extend({
  serviceId: z.uuid("Pick a service"),
  /** `null` means "any available barber". */
  staffId: z.uuid().nullable(),
  /** The chosen slot, as an absolute instant. */
  startsAt: z.iso.datetime({ message: "Pick a time" }),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const slotQuerySchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid().nullable(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
});

/** Flattens a ZodError into `{ field: firstMessage }` for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
