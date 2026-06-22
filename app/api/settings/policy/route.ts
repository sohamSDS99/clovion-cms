/**
 * Org-policy workflow settings (FR-CONTENT-08, §6.3 org policy toggles —
 * Phase 3 "news fast-publish policy").
 *
 *   GET  -> the singleton OrgPolicy row.
 *   PUT  -> partial update of the three workflow toggles.
 *
 * ADMIN ONLY. `configure_ai_provider` is the Admin-only AI concern; org policy
 * is its own concern, so we gate it by the explicit ADMIN role rather than an
 * AI capability. Authorization is server-side and authoritative — the UI's
 * disabled state is best-effort only.
 */
import type { NextRequest } from "next/server";
import { json, parseBody, withRoute } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { AuthzError } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/audit/service";
import { getOrgPolicyRow, updateOrgPolicy } from "@/lib/content/policy";
import { updatePolicySchema } from "./schema";

export const runtime = "nodejs";

/** Throws AuthzError(403) for any non-ADMIN caller. Returns the ADMIN user. */
async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new AuthzError("Admin only.", 403);
  }
  return user;
}

export const GET = withRoute(async () => {
  await requireAdmin();
  return json(await getOrgPolicyRow());
});

export const PUT = withRoute(async (req: NextRequest) => {
  const user = await requireAdmin();
  const patch = await parseBody(req, updatePolicySchema);
  const policy = await updateOrgPolicy(patch, user.id);
  await recordAudit({
    actorId: user.id,
    entityType: "config",
    entityId: policy.id,
    action: "updated",
    diff: { policy: patch },
  });
  return json(policy);
});
