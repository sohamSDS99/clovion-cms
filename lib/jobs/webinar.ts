/**
 * Webinar auto-transition worker (§6.2 webinar delta, FR webinar auto-recorded).
 *
 * After a live webinar's scheduled `endAt` has passed AND a recording URL is
 * present, a published WEBINAR item should automatically flip from "live" to
 * "recorded" so the public site stops advertising a live session. This is gated
 * by the org policy toggle `webinarAutoRecorded` (OFF by default) so editors can
 * opt in. It never changes the content lifecycle status — only the type-specific
 * `typeData` flags — so the publish state machine is untouched.
 *
 * Runs on the same repeatable tick as the scheduled-publish poller (see
 * lib/jobs/worker.ts). The selection predicate `shouldFlip` is a pure function so
 * it can be unit-tested without Redis or a database.
 */

import type { ContentItem } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/service";
import { getOrgPolicyRow } from "@/lib/content/policy";
import { SYSTEM_USER } from "./process";

/**
 * Minimal structural shape of a webinar's `typeData` we read for the flip
 * decision. All fields optional/loose because `typeData` is untrusted JSON.
 */
export interface WebinarTypeData {
  /** ISO timestamp (or epoch ms) when the live session ends. */
  endAt?: string | number | null;
  /** Whether the webinar is currently advertised as live. */
  isLive?: boolean | null;
  /** Whether a recording is already published. */
  isRecorded?: boolean | null;
  /** Public URL of the recording, required before we may flip. */
  recordingUrl?: string | null;
  [key: string]: unknown;
}

/** Structural shape needed by the pure predicate (a subset of ContentItem). */
export interface FlipCandidate {
  typeData: WebinarTypeData;
}

/** Parse `endAt` (ISO string or epoch ms) into a timestamp, or null if absent/invalid. */
function endAtMs(endAt: WebinarTypeData["endAt"]): number | null {
  if (endAt == null) return null;
  if (typeof endAt === "number") return Number.isFinite(endAt) ? endAt : null;
  const t = Date.parse(endAt);
  return Number.isNaN(t) ? null : t;
}

/**
 * Pure: should this webinar flip from live -> recorded right now?
 *
 * Requires ALL of:
 *   - the org policy toggle is ON (`policyOn`),
 *   - `typeData.isLive` is truthy (still advertised as live),
 *   - `typeData.recordingUrl` is a non-empty string (recording available),
 *   - `typeData.endAt` is present and strictly before `now`.
 *
 * Lifecycle status (PUBLISHED) is enforced by the DB query, not here, so this
 * stays a focused, easily-tested predicate.
 */
export function shouldFlip(
  item: FlipCandidate,
  now: Date,
  policyOn: boolean
): boolean {
  if (!policyOn) return false;
  const td = item.typeData ?? {};
  if (!td.isLive) return false;
  if (typeof td.recordingUrl !== "string" || td.recordingUrl.trim() === "") {
    return false;
  }
  const end = endAtMs(td.endAt);
  if (end == null) return false;
  return end < now.getTime();
}

/**
 * Find PUBLISHED WEBINAR items that are candidates to flip. We narrow in SQL to
 * PUBLISHED webinars that are currently flagged live (JSON-path equals true),
 * then apply the precise `shouldFlip` predicate in JS (which also checks
 * endAt/recordingUrl/policy). Returns [] when the policy is OFF.
 */
export async function findWebinarsToFlip(
  now: Date = new Date()
): Promise<ContentItem[]> {
  const policy = await getOrgPolicyRow();
  if (!policy.webinarAutoRecorded) return [];

  const candidates = await prisma.contentItem.findMany({
    where: {
      type: "WEBINAR",
      status: "PUBLISHED",
      deletedAt: null,
      // Pre-filter: only items still advertised as live.
      typeData: { path: ["isLive"], equals: true },
    },
  });

  return candidates.filter((c) =>
    shouldFlip({ typeData: (c.typeData ?? {}) as WebinarTypeData }, now, true)
  );
}

/** Outcome of a single webinar flip, for worker logging/observability. */
export type WebinarFlipOutcome = { contentId: string; flipped: boolean };

/**
 * Flip all due webinars from live -> recorded. For each match we merge the
 * existing `typeData` with `{ isLive: false, isRecorded: true }` (preserving all
 * other fields incl. recordingUrl), persist, and record a content/updated audit
 * row tagged `{ webinarAutoRecorded: true }`. Never throws — returns per-item
 * outcomes so the worker loop keeps running.
 */
export async function processWebinarFlip(
  now: Date = new Date()
): Promise<WebinarFlipOutcome[]> {
  let due: ContentItem[];
  try {
    due = await findWebinarsToFlip(now);
  } catch (err) {
    console.error(
      `[webinar-auto] findWebinarsToFlip failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return [];
  }

  const outcomes: WebinarFlipOutcome[] = [];
  for (const item of due) {
    try {
      const prev = (item.typeData ?? {}) as WebinarTypeData;
      const nextTypeData = { ...prev, isLive: false, isRecorded: true };

      await prisma.contentItem.update({
        where: { id: item.id },
        data: {
          typeData: nextTypeData as object,
          updatedById: SYSTEM_USER.id,
        },
      });

      await recordAudit({
        actorId: SYSTEM_USER.id,
        entityType: "content",
        entityId: item.id,
        action: "updated",
        diff: {
          webinarAutoRecorded: true,
          before: { isLive: prev.isLive ?? null, isRecorded: prev.isRecorded ?? null },
          after: { isLive: false, isRecorded: true },
        },
      });

      outcomes.push({ contentId: item.id, flipped: true });
    } catch (err) {
      console.error(
        `[webinar-auto] failed to flip ${item.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      outcomes.push({ contentId: item.id, flipped: false });
    }
  }
  return outcomes;
}
