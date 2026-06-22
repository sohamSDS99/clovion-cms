/**
 * /api/users — user list + invite (FR-USER-01).
 *   GET  : list users (manage_users / Admin).
 *   POST : invite a new user (manage_users / Admin).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute, json, created, parseBody, parseQuery } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { listUsers, inviteUser } from "@/lib/users/service";
import { inviteUserSchema, ROLE_VALUES, USER_STATUS_VALUES } from "@/lib/users/schemas";

export const runtime = "nodejs";

const querySchema = z.object({
  role: z.enum(ROLE_VALUES).optional(),
  status: z.enum(USER_STATUS_VALUES).optional(),
  q: z.string().trim().min(1).optional(),
});

export const GET = withRoute(async (req: NextRequest) => {
  await requireCapability("manage_users");
  const q = parseQuery(req.nextUrl.searchParams, querySchema);
  const items = await listUsers(q);
  return json({ items });
});

export const POST = withRoute(async (req: NextRequest) => {
  const actor = await requireCapability("manage_users");
  const body = await parseBody(req, inviteUserSchema);
  const result = await inviteUser(actor, body);
  // Include acceptUrl + delivered so the Admin can copy the link if SMTP is off.
  return created(result);
});
