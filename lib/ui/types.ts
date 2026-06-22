/**
 * Shared client-side domain types mirroring the API/Prisma shapes the admin UI
 * consumes. These intentionally mirror (do not import) Prisma so the client
 * bundle never pulls server-only modules. Enum values are UPPERCASE to match
 * the API contract.
 */

export type ContentType = "BLOG" | "WEBINAR" | "NEWS" | "RESOURCE" | "FAQ";

export type ContentStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "SCHEDULED"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

export type Role = "ADMIN" | "EDITOR" | "AUTHOR" | "CONTRIBUTOR" | "VIEWER";

export type MediaKind = "IMAGE" | "VIDEO" | "PDF" | "OTHER";

export type TransitionAction =
  | "submit"
  | "approve_publish"
  | "schedule"
  | "publish_now"
  | "cancel_schedule"
  | "unpublish"
  | "archive"
  | "reject"
  | "restore_to_draft";

/** Tiptap document JSON (opaque to the client beyond the editor itself). */
export type TiptapDoc = Record<string, unknown>;

export interface SeoData {
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogImageAssetId?: string;
  noindex?: boolean;
}

/** A single FAQ entry stored under typeData.faqItems. */
export interface FaqItem {
  question: string;
  answer: string;
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  body: TiptapDoc;
  bodyHtml: string | null;
  excerpt: string | null;
  coverAssetId: string | null;
  status: ContentStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  authorProfileId: string;
  seo: SeoData;
  typeData: Record<string, unknown>;
  categoryId: string | null;
  currentRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
}

export interface ContentRevision {
  id: string;
  contentId: string;
  body: TiptapDoc;
  seo: SeoData;
  typeData: Record<string, unknown>;
  revisionNote: string | null;
  source: "MANUAL" | "AI_GENERATION" | "AUTOSAVE";
  createdAt: string;
  createdById: string | null;
}

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  storageKey: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationS: number | null;
  altText: string | null;
  caption: string | null;
  variants: Partial<Record<"thumb" | "md" | "lg", string>>;
  createdAt: string;
  updatedAt: string;
}

export interface UsageRef {
  type: "content" | "author_profile";
  id: string;
  title: string;
}

export interface WritingSop {
  id: string;
  name: string;
  body: string;
  appliesTo: ContentType[];
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiConfig {
  id: string;
  hasKey: boolean;
  openrouterApiKeyMasked: string | null;
  defaultModel: string | null;
  embeddingModel: string | null;
  maxTokens: number;
  temperature: number;
  monthlyBudgetUsd: string | null;
}

export interface AiModel {
  id: string;
  name?: string;
  [k: string]: unknown;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  diff: unknown;
  at: string;
  actor?: { name: string | null; email: string } | null;
}

/** Field-level error returned by the publish gate (422). */
export interface FieldError {
  field: string;
  message: string;
}

export interface PublishGateDetails {
  errors: FieldError[];
  warnings: FieldError[];
}
