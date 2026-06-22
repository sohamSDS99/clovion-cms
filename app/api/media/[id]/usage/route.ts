/**
 * Where-used lookup for a media asset (FR-MEDIA-04, FR-EDITOR-07).
 *   GET /api/media/:id/usage — structured references to this asset.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { getAsset, whereUsed } from "@/lib/media/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid("Invalid media id.");

/** GET — list content/author references (drives delete-blocking UI). */
export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;
  const assetId = idSchema.parse(id);
  // 404 if the asset itself doesn't exist / is deleted.
  await getAsset(assetId);
  const references = await whereUsed(assetId);
  return json({ references });
});
