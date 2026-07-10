import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  PUBLIC_INCLUDE,
  resolveAvatarUrl,
  resolveResourceDownloadUrl,
} from "@/lib/public/query";
import { toPublicContent, type ContentItemWithRelations } from "@/lib/public/serialize";
import { ArticlePreview } from "@/components/preview/ArticlePreview";

export const runtime = "nodejs";
// A preview must never be cached or indexed — it can show unpublished drafts.
export const dynamic = "force-dynamic";

/**
 * Authenticated full-page preview of a content item in ANY status (draft too).
 * Reuses the public serializer so gating rules hold (a gated RESOURCE never
 * exposes its file URL here), but does NOT require the item to be published.
 */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const item = (await prisma.contentItem.findFirst({
    where: { id, deletedAt: null },
    include: PUBLIC_INCLUDE,
  })) as ContentItemWithRelations | null;
  if (!item) notFound();

  const avatarUrl = await resolveAvatarUrl(item.authorProfile?.avatarAssetId);
  const downloadUrl = await resolveResourceDownloadUrl(item);
  const data = toPublicContent(item, avatarUrl, downloadUrl);

  return <ArticlePreview data={data} status={item.status} />;
}
