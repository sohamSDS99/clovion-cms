/**
 * Content lifecycle workflow types.
 *
 * These are string-literal union types that intentionally mirror the Prisma
 * enum string values (UPPERCASE) WITHOUT importing Prisma. This keeps the
 * workflow module dependency-free and unit-testable in isolation
 * (FR-CONTENT-08, FR-CONTENT-09, PRD §3).
 */

/** Lifecycle states for a content item (must match Prisma `ContentStatus` enum). */
export type ContentStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "SCHEDULED"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

/** User roles (must match Prisma `Role` enum). */
export type Role = "ADMIN" | "EDITOR" | "AUTHOR" | "CONTRIBUTOR" | "VIEWER";

/** Content types (must match Prisma `ContentType` enum). */
export type ContentType = "BLOG" | "RESEARCH" | "WEBINAR" | "NEWS" | "RESOURCE" | "COURSE" | "FAQ";

/**
 * Actions that drive lifecycle transitions (FR-CONTENT-08).
 * `auto_publish` is a SYSTEM action invoked by the scheduled-job worker.
 */
export type TransitionAction =
  | "submit"
  | "approve_publish"
  | "schedule"
  | "publish_now"
  | "cancel_schedule"
  | "auto_publish"
  | "unpublish"
  | "archive"
  | "reject"
  | "restore_to_draft";
