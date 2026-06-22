/**
 * GET /api/analytics/ai — AI budget / usage / grounding analytics (FR-ANALYTICS).
 *
 * Gated behind `view_audit_log` (Admin/Editor) — the same analytics-view tier
 * used for the audit log. Returns the dashboard payload: usage summary (+ live
 * budget status), daily cost timeseries, grounding ("verify facts") rate, and
 * the AI-draft acceptance proxy.
 *
 * Optional `from`/`to` ISO-8601 datetimes narrow the window; omitting both
 * means "all time" (the live budget block is always current-month regardless).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute, json, parseQuery } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { getAiAnalytics } from "@/lib/analytics/ai";

export const runtime = "nodejs";

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // Only "day" granularity is supported today; accepted for forward-compat.
  bucket: z.enum(["day"]).optional(),
});

export const GET = withRoute(async (req: NextRequest) => {
  // Analytics-view gate: Admin/Editor (same tier as the audit log).
  await requireCapability("view_audit_log");

  const q = parseQuery(req.nextUrl.searchParams, querySchema);
  const payload = await getAiAnalytics({
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  });
  return json(payload);
});
