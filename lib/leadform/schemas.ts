/**
 * Zod validation schemas for gated-resource lead forms
 * (FR §6.2 RESOURCE delta, NG3, NFR-SEC-03, PRD Q4).
 *
 * Two distinct concerns live here:
 *  1. The ADMIN-authored *definition* of a form (its ordered `fields[]`).
 *  2. A runtime *submission* validator built dynamically from those fields via
 *     `buildSubmissionSchema(fields)` — this is what the public submit endpoint
 *     uses to validate an end-user's answers before unlocking the PDF.
 */
import { z } from "zod";

/** Field control types a lead form may render. */
export const fieldTypeEnum = z.enum([
  "text",
  "email",
  "tel",
  "textarea",
  "select",
  "checkbox",
]);
export type FieldType = z.infer<typeof fieldTypeEnum>;

/**
 * A single field definition (one entry of `LeadForm.fields`).
 *
 * Rules:
 *  - `name` is the machine key persisted in `LeadSubmission.data`; it must be a
 *    safe identifier (letters/digits/underscore) and unique within the form.
 *  - `select` fields must carry a non-empty `options[]`; other types must not.
 */
export const fieldDefinitionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Field name is required.")
      .max(60)
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_]*$/,
        "Field name must start with a letter and contain only letters, digits or underscores.",
      ),
    label: z.string().trim().min(1, "Field label is required.").max(120),
    type: fieldTypeEnum,
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "select") {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Select fields require at least one option.",
        });
      }
    } else if (field.options && field.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only select fields may define options.",
      });
    }
  });
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

/** Ordered array of field definitions with unique `name`s. */
export const fieldsSchema = z
  .array(fieldDefinitionSchema)
  .max(40, "A lead form may have at most 40 fields.")
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      const key = f.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "name"],
          message: `Duplicate field name "${f.name}".`,
        });
      }
      seen.add(key);
    });
  });

/** POST /api/leadforms — create a new lead form. */
export const createLeadFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  fields: fieldsSchema.default([]),
  isActive: z.boolean().optional(),
});
export type CreateLeadFormInput = z.infer<typeof createLeadFormSchema>;

/** PATCH /api/leadforms/[id] — partial edit. */
export const updateLeadFormSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    fields: fieldsSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  });
export type UpdateLeadFormInput = z.infer<typeof updateLeadFormSchema>;

/** GET /api/leadforms/[id]/submissions — pagination query. */
export const listSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().uuid().optional(),
});
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;

/**
 * Build a submission validator from a form's persisted field definitions.
 *
 * Behaviour (the security-relevant validator):
 *  - Always requires a top-level `email` (string, email-formatted) — this is the
 *    lead's contact and is stored on `LeadSubmission.email` directly.
 *  - `data` is an object whose shape is derived per-field:
 *      - required text/email/tel/textarea/select -> non-empty string
 *        (email/select get format/enum checks).
 *      - required checkbox -> must be `true` (a ticked consent box).
 *      - optional fields -> may be omitted, but if present are still type-checked.
 *  - Unknown keys in `data` are STRIPPED (zod default for objects), so a hostile
 *    client cannot smuggle arbitrary keys into stored submission data.
 *
 * The factory accepts the raw persisted `fields` (validated via `fieldsSchema`)
 * — invalid stored definitions throw, which the caller surfaces as a 500-ish
 * config error rather than silently accepting bad input.
 */
export function buildSubmissionSchema(fields: unknown) {
  const defs = fieldsSchema.parse(fields);

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of defs) {
    let base: z.ZodTypeAny;

    switch (field.type) {
      case "email":
        base = z.string().trim().email("A valid email is required.");
        break;
      case "checkbox":
        // A checkbox value is a boolean; when required it must be ticked.
        base = field.required
          ? z.literal(true, {
              errorMap: () => ({ message: `${field.label} must be checked.` }),
            })
          : z.boolean();
        break;
      case "select": {
        const opts = field.options ?? [];
        base =
          opts.length > 0
            ? z.enum(opts as [string, ...string[]])
            : z.string();
        break;
      }
      case "text":
      case "tel":
      case "textarea":
      default:
        base = z.string().trim();
        break;
    }

    // Required string-like fields must be non-empty.
    if (field.required && field.type !== "checkbox" && field.type !== "select") {
      base = (base as z.ZodString).min(1, `${field.label} is required.`);
    }
    if (field.required && field.type === "select") {
      base = (base as z.ZodTypeAny).refine((v) => v != null && v !== "", {
        message: `${field.label} is required.`,
      });
    }

    shape[field.name] = field.required ? base : base.optional();
  }

  return z.object({
    // Top-level lead email is always required regardless of the form fields.
    email: z.string().trim().email("A valid email is required."),
    // Per-field answers. Unknown keys are stripped (no .passthrough()).
    data: z.object(shape).default({}),
  });
}

export type SubmissionInput = z.infer<ReturnType<typeof buildSubmissionSchema>>;
