/**
 * Pure, dependency-free Writing SOP decision logic (FR-SETTINGS-01, §10 Q8).
 *
 * No Prisma / next-auth imports here so it stays trivially unit-testable.
 * The "one active SOP per content type" invariant is enforced by computing,
 * at activation time, which other currently-active SOPs must be deactivated
 * because their `appliesTo` overlaps the activating SOP's `appliesTo`.
 */
import type { ContentType } from "@/lib/auth/rbac";

/** Minimal shape needed to decide deactivation — keeps this DB-agnostic. */
export interface SopOverlapCandidate {
  id: string;
  appliesTo: ContentType[];
}

/** True if the two content-type lists share at least one type. */
export function appliesToOverlaps(a: ContentType[], b: ContentType[]): boolean {
  const set = new Set(a);
  return b.some((t) => set.has(t));
}

/**
 * Given the content types the SOP being activated governs (`targetAppliesTo`)
 * and the set of OTHER SOPs (excluding the one being activated), return the ids
 * of those that must be deactivated to preserve "exactly one active per type".
 *
 * A candidate is deactivated iff its `appliesTo` overlaps `targetAppliesTo`.
 * Callers should pass only currently-active OTHER SOPs.
 */
export function sopsToDeactivate(
  targetAppliesTo: ContentType[],
  otherSops: SopOverlapCandidate[]
): string[] {
  return otherSops
    .filter((sop) => appliesToOverlaps(targetAppliesTo, sop.appliesTo))
    .map((sop) => sop.id);
}
