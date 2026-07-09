/**
 * Publish validation gate (FR-CONTENT-09).
 *
 * Pure validation of a content item against the rules required to publish.
 * Errors block publishing (ok === false); warnings are advisory only.
 */

import type { ContentType } from "./types";

export interface PublishCandidate {
  type: ContentType;
  title: string;
  slug: string;
  /** Whether `slug` is unique within this content type. */
  slugUniqueInType: boolean;
  seo: {
    metaTitle?: string;
    metaDescription?: string;
  };
  coverAssetId?: string | null;
  /** Type-specific payload (e.g. pdfAssetId, startAt, faqItems). */
  typeData: Record<string, any>;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface PublishValidationResult {
  ok: boolean;
  errors: FieldError[];
  warnings: FieldError[];
}

const META_TITLE_MAX = 60;
const META_DESC_MIN = 50;
const META_DESC_MAX = 160;

/**
 * Validate a content item for publishing (FR-CONTENT-09).
 * @returns errors/warnings; `ok` is true only when there are zero errors.
 */
export function validateForPublish(item: PublishCandidate): PublishValidationResult {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];

  // --- Title -----------------------------------------------------------
  if (!item.title || item.title.trim().length === 0) {
    errors.push({ field: "title", message: "Title is required." });
  }

  // --- Slug ------------------------------------------------------------
  if (!item.slug || item.slug.trim().length === 0) {
    errors.push({ field: "slug", message: "Slug is required." });
  } else if (!item.slugUniqueInType) {
    errors.push({
      field: "slug",
      message: "Slug must be unique within its content type.",
    });
  }

  // --- SEO meta title --------------------------------------------------
  const metaTitle = item.seo?.metaTitle;
  if (!metaTitle || metaTitle.trim().length === 0) {
    errors.push({ field: "seo.metaTitle", message: "Meta title is required." });
  } else if (metaTitle.length > META_TITLE_MAX) {
    errors.push({
      field: "seo.metaTitle",
      message: `Meta title must be ${META_TITLE_MAX} characters or fewer.`,
    });
  }

  // --- SEO meta description --------------------------------------------
  const metaDesc = item.seo?.metaDescription;
  const descLen = metaDesc ? metaDesc.length : 0;
  if (descLen < META_DESC_MIN || descLen > META_DESC_MAX) {
    errors.push({
      field: "seo.metaDescription",
      message: `Meta description must be between ${META_DESC_MIN} and ${META_DESC_MAX} characters.`,
    });
  }

  // --- Cover image -----------------------------------------------------
  // ERROR for BLOG (cover required), WARNING for all other types.
  if (!item.coverAssetId) {
    if (item.type === "BLOG") {
      errors.push({ field: "coverAssetId", message: "Blog posts require a cover image." });
    } else {
      warnings.push({
        field: "coverAssetId",
        message: "A cover image is recommended.",
      });
    }
  }

  // --- Type-specific requirements --------------------------------------
  switch (item.type) {
    // RESEARCH is a gated downloadable report — same publish requirements as
    // RESOURCE (a PDF must be attached to publish).
    case "RESOURCE":
    case "RESEARCH": {
      if (!item.typeData?.pdfAssetId) {
        errors.push({
          field: "typeData.pdfAssetId",
          message: "A downloadable PDF is required.",
        });
      }
      break;
    }
    case "WEBINAR": {
      if (!item.typeData?.startAt) {
        errors.push({
          field: "typeData.startAt",
          message: "Webinars require a start time.",
        });
      }
      if (!item.typeData?.registrationUrl) {
        errors.push({
          field: "typeData.registrationUrl",
          message: "Webinars require a registration URL.",
        });
      }
      break;
    }
    case "FAQ": {
      const faqItems = item.typeData?.faqItems;
      if (!Array.isArray(faqItems) || faqItems.length === 0) {
        errors.push({
          field: "typeData.faqItems",
          message: "FAQs require at least one FAQ item.",
        });
      }
      break;
    }
    // BLOG and NEWS have no extra type-specific required fields here.
    default:
      break;
  }

  return { ok: errors.length === 0, errors, warnings };
}
