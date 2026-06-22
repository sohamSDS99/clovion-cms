/**
 * Single media asset routes (FR-MEDIA-03, FR-MEDIA-04).
 *   GET    /api/media/:id   — fetch one asset
 *   PATCH  /api/media/:id   — update alt text / caption
 *   DELETE /api/media/:id   — soft-delete (blocked 409 if still in use)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  withRoute,
  json,
  noContent,
  parseBody,
} from "@/lib/api/http";
import { requireUser, requireCapability } from "@/lib/auth/guard";
import {
  getAsset,
  updateMetadata,
  deleteAsset,
  serializeAsset,
} from "@/lib/media/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid("Invalid media id.");

const patchSchema = z
  .object({
    altText: z.string().max(500).nullish(),
    caption: z.string().max(2000).nullish(),
  })
  .refine((v) => v.altText !== undefined || v.caption !== undefined, {
    message: "Provide at least one of altText or caption.",
  });

/** GET — fetch a single asset (any authenticated user). */
export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;
  const asset = await getAsset(idSchema.parse(id));
  return json(serializeAsset(asset));
});

/** PATCH — edit editorial metadata. Requires manage_media_library. */
export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireCapability("manage_media_library");
  const { id } = await params;
  const patch = await parseBody(req, patchSchema);
  const asset = await updateMetadata(user, idSchema.parse(id), patch);
  return json(serializeAsset(asset));
});

/** DELETE — soft-delete an asset (deleteAsset re-checks the capability). */
export const DELETE = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteAsset(user, idSchema.parse(id));
  return noContent();
});
