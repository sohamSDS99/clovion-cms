/**
 * Org-level workflow policy (FR-CONTENT-08).
 *
 * Controls whether Authors may self-publish/schedule their own content and
 * whether NEWS content gets a fast-publish lane. Consumed by the workflow
 * authorization layer via `authorizeTransition`.
 *
 * TODO: back this with an org `Settings` table later so admins can toggle it
 * at runtime; for now it is read from environment variables with documented
 * defaults.
 */

import type { WorkflowPolicy } from "@/lib/workflow";

/** Documented defaults: global self-publish OFF, NEWS fast-publish ON. */
const DEFAULT_SELF_PUBLISH = false;
const DEFAULT_NEWS_FAST_PUBLISH = true;

/**
 * Parse an env flag. Accepts "1"/"true"/"yes"/"on" (case-insensitive) as true,
 * "0"/"false"/"no"/"off" as false. Anything else falls back to `fallback`.
 */
function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

/** Resolve the current org workflow policy from env (with defaults). */
export function getOrgPolicy(): WorkflowPolicy {
  return {
    selfPublish: parseBoolEnv(process.env.ORG_SELF_PUBLISH, DEFAULT_SELF_PUBLISH),
    newsFastPublish: parseBoolEnv(
      process.env.ORG_NEWS_FAST_PUBLISH,
      DEFAULT_NEWS_FAST_PUBLISH
    ),
  };
}
