import { Suspense } from "react";
import { ContentList } from "@/components/content/ContentList";
import { Loading } from "@/components/ui/Feedback";

/** Content list / browse / review-queue page (P0). */
export default function ContentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ContentList />
    </Suspense>
  );
}
