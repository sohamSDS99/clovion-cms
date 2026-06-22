import { describe, it, expect } from "vitest";
import {
  fieldDefinitionSchema,
  fieldsSchema,
  createLeadFormSchema,
  updateLeadFormSchema,
  buildSubmissionSchema,
  type FieldDefinition,
} from "@/lib/leadform/schemas";

describe("fieldDefinitionSchema", () => {
  it("accepts a valid text field and defaults required=false", () => {
    const parsed = fieldDefinitionSchema.parse({
      name: "fullName",
      label: "Full name",
      type: "text",
    });
    expect(parsed.required).toBe(false);
  });

  it("rejects an invalid machine name", () => {
    const r = fieldDefinitionSchema.safeParse({
      name: "full name", // space not allowed
      label: "Full name",
      type: "text",
    });
    expect(r.success).toBe(false);
  });

  it("requires options for select fields", () => {
    const r = fieldDefinitionSchema.safeParse({
      name: "role",
      label: "Role",
      type: "select",
    });
    expect(r.success).toBe(false);
  });

  it("rejects options on non-select fields", () => {
    const r = fieldDefinitionSchema.safeParse({
      name: "email",
      label: "Email",
      type: "email",
      options: ["a", "b"],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a select with options", () => {
    const r = fieldDefinitionSchema.safeParse({
      name: "role",
      label: "Role",
      type: "select",
      options: ["Engineer", "Manager"],
    });
    expect(r.success).toBe(true);
  });
});

describe("fieldsSchema (unique names)", () => {
  it("rejects duplicate field names (case-insensitive)", () => {
    const r = fieldsSchema.safeParse([
      { name: "company", label: "Company", type: "text", required: false },
      { name: "Company", label: "Company 2", type: "text", required: false },
    ]);
    expect(r.success).toBe(false);
  });

  it("accepts distinct names", () => {
    const r = fieldsSchema.safeParse([
      { name: "company", label: "Company", type: "text", required: false },
      { name: "role", label: "Role", type: "text", required: false },
    ]);
    expect(r.success).toBe(true);
  });
});

describe("createLeadFormSchema / updateLeadFormSchema", () => {
  it("creates with an empty default fields array", () => {
    const parsed = createLeadFormSchema.parse({ name: "Whitepaper gate" });
    expect(parsed.fields).toEqual([]);
  });

  it("update rejects an empty patch", () => {
    expect(updateLeadFormSchema.safeParse({}).success).toBe(false);
  });

  it("update accepts a single-field patch", () => {
    expect(updateLeadFormSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe("buildSubmissionSchema", () => {
  const fields: FieldDefinition[] = [
    { name: "company", label: "Company", type: "text", required: true },
    { name: "role", label: "Role", type: "text", required: false },
    {
      name: "size",
      label: "Company size",
      type: "select",
      required: true,
      options: ["1-10", "11-50", "51+"],
    },
    { name: "consent", label: "I agree", type: "checkbox", required: true },
  ];

  it("requires a valid top-level email", () => {
    const schema = buildSubmissionSchema(fields);
    const bad = schema.safeParse({
      email: "not-an-email",
      data: { company: "Acme", size: "1-10", consent: true },
    });
    expect(bad.success).toBe(false);

    const good = schema.safeParse({
      email: "lead@acme.com",
      data: { company: "Acme", size: "1-10", consent: true },
    });
    expect(good.success).toBe(true);
  });

  it("enforces required fields", () => {
    const schema = buildSubmissionSchema(fields);
    const r = schema.safeParse({
      email: "lead@acme.com",
      data: { size: "1-10", consent: true }, // missing required company
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty string for a required text field", () => {
    const schema = buildSubmissionSchema(fields);
    const r = schema.safeParse({
      email: "lead@acme.com",
      data: { company: "", size: "1-10", consent: true },
    });
    expect(r.success).toBe(false);
  });

  it("requires a ticked checkbox when the checkbox is required", () => {
    const schema = buildSubmissionSchema(fields);
    const r = schema.safeParse({
      email: "lead@acme.com",
      data: { company: "Acme", size: "1-10", consent: false },
    });
    expect(r.success).toBe(false);
  });

  it("validates select against its option enum", () => {
    const schema = buildSubmissionSchema(fields);
    const r = schema.safeParse({
      email: "lead@acme.com",
      data: { company: "Acme", size: "99999", consent: true },
    });
    expect(r.success).toBe(false);
  });

  it("allows optional fields to be omitted", () => {
    const schema = buildSubmissionSchema(fields);
    const r = schema.safeParse({
      email: "lead@acme.com",
      data: { company: "Acme", size: "11-50", consent: true }, // no role
    });
    expect(r.success).toBe(true);
  });

  it("strips unknown keys from data", () => {
    const schema = buildSubmissionSchema(fields);
    const r = schema.parse({
      email: "lead@acme.com",
      data: {
        company: "Acme",
        size: "51+",
        consent: true,
        injected: "evil",
      },
    });
    expect(r.data).not.toHaveProperty("injected");
    expect(r.data).toMatchObject({ company: "Acme", size: "51+", consent: true });
  });

  it("validates an email-typed field's format", () => {
    const emailField: FieldDefinition[] = [
      { name: "workEmail", label: "Work email", type: "email", required: true },
    ];
    const schema = buildSubmissionSchema(emailField);
    expect(
      schema.safeParse({
        email: "lead@acme.com",
        data: { workEmail: "bogus" },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        email: "lead@acme.com",
        data: { workEmail: "work@acme.com" },
      }).success,
    ).toBe(true);
  });

  it("trims whitespace-only required text to fail", () => {
    const schema = buildSubmissionSchema([
      { name: "company", label: "Company", type: "text", required: true },
    ]);
    const r = schema.safeParse({ email: "a@b.com", data: { company: "   " } });
    expect(r.success).toBe(false);
  });

  it("handles a form with no fields (email only)", () => {
    const schema = buildSubmissionSchema([]);
    expect(schema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(schema.safeParse({ email: "nope" }).success).toBe(false);
  });
});
