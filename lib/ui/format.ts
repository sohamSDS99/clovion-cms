/**
 * Pure presentation helpers shared across the admin UI. Kept free of React/DOM
 * so they are trivially unit-testable (see lib/ui/__tests__).
 */

import type { ContentStatus, ContentType } from "./types";

/** Visual variant keyed for the Badge component. */
export type BadgeTone =
  | "draft"
  | "review"
  | "scheduled"
  | "published"
  | "unpublished"
  | "archived"
  | "neutral"
  | "accent";

/** Map a lifecycle status to its badge tone + human label. */
export function statusBadge(status: ContentStatus): {
  tone: BadgeTone;
  label: string;
} {
  switch (status) {
    case "DRAFT":
      return { tone: "draft", label: "Draft" };
    case "IN_REVIEW":
      return { tone: "review", label: "In review" };
    case "SCHEDULED":
      return { tone: "scheduled", label: "Scheduled" };
    case "PUBLISHED":
      return { tone: "published", label: "Published" };
    case "UNPUBLISHED":
      return { tone: "unpublished", label: "Unpublished" };
    case "ARCHIVED":
      return { tone: "archived", label: "Archived" };
    default:
      return { tone: "neutral", label: status };
  }
}

/** Human label for a content type. */
export function contentTypeLabel(type: ContentType): string {
  switch (type) {
    case "BLOG":
      return "Blog";
    case "WEBINAR":
      return "Webinar";
    case "NEWS":
      return "News";
    case "RESOURCE":
      return "Resource";
    case "FAQ":
      return "FAQ";
    default:
      return type;
  }
}

export const CONTENT_TYPES: ContentType[] = [
  "BLOG",
  "WEBINAR",
  "NEWS",
  "RESOURCE",
  "FAQ",
];

export const CONTENT_STATUSES: ContentStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "SCHEDULED",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED",
];

/**
 * Slug-from-title — kebab-case, [a-z0-9-], diacritics stripped, repeats
 * collapsed. Mirrors lib/content/slug.ts `slugify` so the editor preview
 * matches what the server will persist. (FR-CONTENT-02, FR-EDITOR-05.)
 */
export function slugFromTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** SEO meta-title length assessment (FR-EDITOR-05). Warn above 60 chars. */
export function metaTitleStatus(value: string): {
  count: number;
  state: "ok" | "warn" | "empty";
} {
  const count = value.length;
  if (count === 0) return { count, state: "empty" };
  return { count, state: count > 60 ? "warn" : "ok" };
}

/**
 * SEO meta-description length assessment (FR-EDITOR-05). The sweet spot is
 * 50–160 chars; anything outside that range warns.
 */
export function metaDescriptionStatus(value: string): {
  count: number;
  state: "ok" | "warn" | "empty";
} {
  const count = value.length;
  if (count === 0) return { count, state: "empty" };
  return { count, state: count < 50 || count > 160 ? "warn" : "ok" };
}

/** Compact relative time (e.g. "3m ago", "2d ago") for list/detail timestamps. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Absolute, locale-aware date-time for detail views. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human-readable file size from a byte count. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  // Whole numbers and bytes drop decimals; otherwise one decimal place, with a
  // trailing ".0" trimmed (so 1024 -> "1 KB", not "1.0 KB").
  if (i === 0 || Number.isInteger(value) || value >= 100) {
    return `${Math.round(value)} ${units[i]}`;
  }
  return `${value.toFixed(1).replace(/\.0$/, "")} ${units[i]}`;
}

/**
 * Convert a datetime-local input value (no zone) to an ISO-8601 string suitable
 * for the schedule transition payload. Returns null on invalid input.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Convert an ISO string back to a datetime-local input value (local zone). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
