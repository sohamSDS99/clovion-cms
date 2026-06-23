import { Suspense } from "react";
import { CreateContent } from "./CreateContent";
import { Loading } from "@/components/ui/Feedback";

/**
 * "Create New" entrypoint (FR-CONTENT-01). Reached from the sidebar
 * /content/new?type=<TYPE> links: creates a DRAFT of that type and redirects
 * straight into the editor. Wrapped in Suspense for useSearchParams.
 */
export default function NewContentPage() {
  return (
    <Suspense fallback={<Loading label="Creating…" />}>
      <CreateContent />
    </Suspense>
  );
}
