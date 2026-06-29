/**
 * /api/settings/writing-style — the single org-wide master writing-style prompt
 * the AI follows for every content type (FR-SETTINGS-01).
 *   GET : current master prompt (edit_writing_sop — ADMIN/EDITOR).
 *   PUT : replace the master prompt (edit_writing_sop). Upserts + activates.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute, json, parseBody } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import {
  getMasterWritingStyle,
  setMasterWritingStyle,
} from "@/lib/sop/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  body: z.string().trim().max(20000),
});

export const GET = withRoute(async () => {
  await requireCapability("edit_writing_sop");
  const style = await getMasterWritingStyle();
  return json(style);
});

export const PUT = withRoute(async (req: NextRequest) => {
  const user = await requireCapability("edit_writing_sop");
  const { body } = await parseBody(req, bodySchema);
  const style = await setMasterWritingStyle(user, body);
  return json(style);
});
