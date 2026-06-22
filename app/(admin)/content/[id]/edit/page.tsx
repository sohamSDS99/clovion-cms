import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ContentEditor } from "@/components/editor/ContentEditor";

/**
 * Editor route shell. Server component: resolves the session (for role + the
 * acting user's id, used for best-effort action gating) and hands off to the
 * client editor which loads the item and manages autosave/lifecycle.
 */
export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <ContentEditor
      contentId={id}
      userId={session.user.id}
      role={session.user.role}
    />
  );
}
