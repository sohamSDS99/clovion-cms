/**
 * Org-level workflow policy (FR-CONTENT-08, §6.3 org policy toggles).
 *
 * Runtime-editable by an Admin and persisted as a singleton OrgPolicy row
 * (Phase 3). Controls whether Authors may self-publish/schedule their own
 * content, whether NEWS gets a fast-publish lane, and whether webinars
 * auto-flip to recorded after they end. Consumed by the workflow authorization
 * layer via `authorizeTransition` and by the webinar auto-transition worker.
 */

import type { OrgPolicy } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { WorkflowPolicy } from "@/lib/workflow";

/**
 * Read the singleton OrgPolicy row, creating it with model defaults
 * (selfPublish OFF, newsFastPublish ON, webinarAutoRecorded OFF) on first use.
 */
export async function getOrgPolicyRow(): Promise<OrgPolicy> {
  const existing = await prisma.orgPolicy.findFirst();
  if (existing) return existing;
  return prisma.orgPolicy.create({ data: {} });
}

/** Resolve the workflow policy shape consumed by authorizeTransition. */
export async function getOrgPolicy(): Promise<WorkflowPolicy> {
  const row = await getOrgPolicyRow();
  return {
    selfPublish: row.selfPublish,
    newsFastPublish: row.newsFastPublish,
  };
}

export interface OrgPolicyPatch {
  selfPublish?: boolean;
  newsFastPublish?: boolean;
  webinarAutoRecorded?: boolean;
}

/** Update the singleton OrgPolicy (Admin only — gated at the route). */
export async function updateOrgPolicy(
  patch: OrgPolicyPatch,
  updatedById?: string | null
): Promise<OrgPolicy> {
  const row = await getOrgPolicyRow();
  return prisma.orgPolicy.update({
    where: { id: row.id },
    data: { ...patch, updatedById: updatedById ?? undefined },
  });
}
