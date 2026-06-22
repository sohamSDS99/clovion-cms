/**
 * Structural validation for schema.org JSON-LD (NFR-SEO-01).
 *
 * Complements generateJsonLd (lib/seo/jsonld): where that BUILDS the object, this
 * VERIFIES an arbitrary JSON-LD object has the @context / @type and the minimum
 * per-type fields Google requires for rich results. The editor's schema panel can
 * surface these errors before publish.
 *
 * This is intentionally structural (presence + non-emptiness), not a full
 * schema.org validator. Pure + dependency-free → trivially unit-testable.
 */

export interface JsonLdValidationResult {
  valid: boolean;
  errors: string[];
}

/** schema.org @type → list of required top-level fields. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  // Article family.
  Article: ["headline"],
  BlogPosting: ["headline", "datePublished"],
  NewsArticle: ["headline", "datePublished"],
  // Webinar.
  Event: ["startDate"],
  // FAQ.
  FAQPage: ["mainEntity"],
};

/** A value counts as "present" when it is not undefined/null, "" (after trim), or []. */
function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Validate a JSON-LD object structurally.
 *
 * Checks, in order:
 *   1. it is a non-null plain object
 *   2. it has a "@context" of "https://schema.org" (http/https + trailing slash tolerant)
 *   3. it has a non-empty "@type"
 *   4. all required fields for that @type are present (when the @type is recognized)
 */
export function validateJsonLd(obj: unknown): JsonLdValidationResult {
  const errors: string[] = [];

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { valid: false, errors: ["JSON-LD must be a non-null object."] };
  }

  const ld = obj as Record<string, unknown>;

  // @context
  const context = ld["@context"];
  if (!isPresent(context)) {
    errors.push('Missing "@context".');
  } else if (typeof context === "string" && !/schema\.org\/?$/i.test(context)) {
    errors.push('"@context" should reference schema.org.');
  }

  // @type
  const atType = ld["@type"];
  if (!isPresent(atType) || typeof atType !== "string") {
    errors.push('Missing "@type".');
    // Without a @type we cannot check type-specific fields.
    return { valid: errors.length === 0, errors };
  }

  // Per-type required fields (only enforced for recognized types).
  const required = REQUIRED_FIELDS[atType];
  if (required) {
    for (const field of required) {
      if (!isPresent(ld[field])) {
        errors.push(`"${atType}" requires a non-empty "${field}".`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
