/**
 * Client-side domain types for the lead-form admin UI. These mirror (do not
 * import) the server/Prisma shapes so the client bundle stays server-free.
 */

export type LeadFieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "select"
  | "checkbox";

export interface LeadField {
  name: string;
  label: string;
  type: LeadFieldType;
  required: boolean;
  options?: string[];
}

export interface LeadForm {
  id: string;
  name: string;
  description: string | null;
  fields: LeadField[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { submissions: number };
}

export interface LeadSubmission {
  id: string;
  leadFormId: string;
  contentId: string | null;
  email: string;
  data: Record<string, unknown>;
  ipHash: string | null;
  createdAt: string;
}

export const FIELD_TYPE_OPTIONS: { value: LeadFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];
