/**
 * Media library collection routes (FR-MEDIA-01, FR-MEDIA-03).
 *   GET  /api/media         — browse the library (filter + cursor paginate)
 *   POST /api/media         — multipart upload (creates asset + variants)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  withRoute,
  json,
  created,
  parseQuery,
  BadRequestError,
} from "@/lib/api/http";
import { requireUser, requireCapability } from "@/lib/auth/guard";
import { ensureBucket } from "@/lib/media/storage";
import {
  createAssetFromUpload,
  listAssets,
  serializeAsset,
} from "@/lib/media/service";

export const runtime = "nodejs";

const listQuerySchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO", "PDF", "OTHER"]).optional(),
  uploadedById: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
});

/** GET — list/browse assets (any authenticated user). */
export const GET = withRoute(async (req: NextRequest) => {
  await requireUser();
  const filters = parseQuery(req.nextUrl.searchParams, listQuerySchema);
  const result = await listAssets(filters);
  return json({
    items: result.items.map(serializeAsset),
    nextCursor: result.nextCursor,
  });
});

/** POST — upload a file via multipart/form-data (field name: `file`). */
export const POST = withRoute(async (req: NextRequest) => {
  const user = await requireCapability("upload_media");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new BadRequestError("Expected multipart/form-data upload.");
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || typeof (file as File).name !== "string") {
    throw new BadRequestError("Missing `file` upload field.");
  }
  const upload = file as File;

  const buffer = Buffer.from(await upload.arrayBuffer());

  // Lazily ensure the bucket exists (no-op once created; supports MinIO).
  await ensureBucket();

  const asset = await createAssetFromUpload(user, {
    buffer,
    filename: upload.name,
    mimeType: upload.type || "application/octet-stream",
    sizeBytes: buffer.byteLength,
  });

  return created(serializeAsset(asset));
});
