import { LeadFormManager } from "@/components/leadforms/LeadFormManager";

/**
 * Lead Forms (Phase 3): manage gated-resource lead capture forms — list,
 * build/edit fields, and view submissions. API enforces ADMIN/EDITOR.
 */
export default function LeadFormsPage() {
  return <LeadFormManager />;
}
