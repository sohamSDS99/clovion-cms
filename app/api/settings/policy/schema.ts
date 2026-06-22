/**
 * Org-policy PUT body schema (FR-CONTENT-08). Pure module — no Prisma / auth /
 * next-server imports — so it stays unit-testable in the node environment.
 *
 * Each of the three workflow toggles is optional, but when present must be a
 * strict boolean. Unknown keys are rejected.
 */
import { z } from "zod";

export const updatePolicySchema = z
  .object({
    selfPublish: z.boolean().optional(),
    newsFastPublish: z.boolean().optional(),
    webinarAutoRecorded: z.boolean().optional(),
  })
  .strict();

export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
