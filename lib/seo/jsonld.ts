/**
 * schema.org JSON-LD generation for published content (NFR-SEO-01).
 *
 * The public site embeds the returned object inside a
 * <script type="application/ld+json"> tag, so every value must be JSON-safe and
 * conform to schema.org so rich results validate.
 *
 * Mapping by ContentType:
 *   BLOG / NEWS  -> BlogPosting (BLOG) / NewsArticle (NEWS), an Article subtype
 *   RESEARCH     -> Article (a plain long-form article, like BLOG)
 *   WEBINAR      -> Event (startDate/endDate from typeData, url=registrationUrl)
 *   FAQ          -> FAQPage (mainEntity built from typeData.faqItems Q&A)
 *   RESOURCE     -> Article; when an ungated download exists, the download URL is
 *                   surfaced via `associatedMedia` (CreativeWork). Gated resources
 *                   omit the URL entirely (NFR-SEC-03 / NG3).
 *
 * This module is PURE: it takes a plain, already-serialized item and returns a
 * plain object. No Prisma, no I/O — so it stays trivially unit-testable.
 */

import type { ContentType } from "@prisma/client";

/** Public author shape relevant to JSON-LD. */
export interface JsonLdAuthor {
  displayName: string;
  slug?: string;
  url?: string;
}

/**
 * Minimal, presentation-agnostic view of a content item used to build JSON-LD.
 * The serializer (lib/public/serialize) constructs this from a ContentItem.
 */
export interface JsonLdInput {
  type: ContentType;
  title: string;
  slug: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  /** Absolute canonical URL of this item on the public site, if known. */
  canonicalUrl?: string | null;
  author?: JsonLdAuthor | null;
  /** Per-type structured fields (ContentItem.typeData). */
  typeData?: Record<string, unknown> | null;
  /** Whether a RESOURCE requires a lead form before download (gated). */
  gated?: boolean;
}

type JsonLd = Record<string, unknown>;

const SCHEMA_CONTEXT = "https://schema.org";

/** Coerce a Date | string | null into an ISO-8601 string, or undefined. */
function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Build a schema.org Person/Organization author node. */
function authorNode(author: JsonLdAuthor | null | undefined): JsonLd | undefined {
  if (!author?.displayName) return undefined;
  const node: JsonLd = { "@type": "Person", name: author.displayName };
  if (author.url) node.url = author.url;
  return node;
}

/** Drop undefined values so the emitted JSON-LD stays compact and valid. */
function compact<T extends JsonLd>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

// ── Article family (BLOG / NEWS / RESOURCE) ───────────────────────────────────

function articleJsonLd(item: JsonLdInput, atType: string): JsonLd {
  return compact({
    "@context": SCHEMA_CONTEXT,
    "@type": atType,
    headline: item.title,
    description: item.excerpt ?? undefined,
    image: item.coverImageUrl ?? undefined,
    datePublished: toIso(item.publishedAt),
    dateModified: toIso(item.updatedAt) ?? toIso(item.publishedAt),
    author: authorNode(item.author),
    mainEntityOfPage: item.canonicalUrl ?? undefined,
    url: item.canonicalUrl ?? undefined,
  });
}

// ── WEBINAR -> Event ──────────────────────────────────────────────────────────

function eventJsonLd(item: JsonLdInput): JsonLd {
  const td = item.typeData ?? {};
  const startAt = td.startAt as string | undefined;
  const endAt = td.endAt as string | undefined;
  const registrationUrl = td.registrationUrl as string | undefined;

  const node: JsonLd = {
    "@context": SCHEMA_CONTEXT,
    "@type": "Event",
    name: item.title,
    description: item.excerpt ?? undefined,
    image: item.coverImageUrl ?? undefined,
    startDate: toIso(startAt ?? null),
    endDate: toIso(endAt ?? null),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    // For online webinars, location is a VirtualLocation carrying the join/register URL.
    location: registrationUrl
      ? { "@type": "VirtualLocation", url: registrationUrl }
      : item.canonicalUrl
        ? { "@type": "VirtualLocation", url: item.canonicalUrl }
        : undefined,
    url: registrationUrl ?? item.canonicalUrl ?? undefined,
    organizer: authorNode(item.author),
  };
  return compact(node);
}

// ── FAQ -> FAQPage ────────────────────────────────────────────────────────────

interface FaqItem {
  question?: string;
  answer?: string;
  q?: string;
  a?: string;
}

function faqJsonLd(item: JsonLdInput): JsonLd {
  const td = item.typeData ?? {};
  const rawItems = Array.isArray(td.faqItems) ? (td.faqItems as FaqItem[]) : [];
  const mainEntity = rawItems
    .map((entry) => {
      const question = entry.question ?? entry.q;
      const answer = entry.answer ?? entry.a;
      if (!question || !answer) return null;
      return {
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return compact({
    "@context": SCHEMA_CONTEXT,
    "@type": "FAQPage",
    name: item.title,
    url: item.canonicalUrl ?? undefined,
    mainEntity,
  });
}

// ── RESOURCE -> Article (+ optional download CreativeWork) ────────────────────

function resourceJsonLd(item: JsonLdInput): JsonLd {
  const base = articleJsonLd(item, "Article");
  const td = item.typeData ?? {};
  const downloadUrl = td.downloadUrl as string | undefined;

  // NFR-SEC-03 / NG3: never surface a download URL for a gated resource, even in
  // structured data. Only attach the CreativeWork when ungated AND a URL exists.
  if (!item.gated && downloadUrl) {
    base.associatedMedia = {
      "@type": "CreativeWork",
      url: downloadUrl,
      name: (td.fileLabel as string | undefined) ?? `${item.title} download`,
    };
  }
  return base;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Build the schema.org JSON-LD object for a serialized content item.
 * Always returns a single JSON-LD object (never an array).
 */
export function generateJsonLd(item: JsonLdInput): JsonLd {
  switch (item.type) {
    case "BLOG":
      return articleJsonLd(item, "BlogPosting");
    case "RESEARCH":
      return articleJsonLd(item, "Article");
    case "NEWS":
      return articleJsonLd(item, "NewsArticle");
    case "WEBINAR":
      return eventJsonLd(item);
    case "FAQ":
      return faqJsonLd(item);
    case "RESOURCE":
      return resourceJsonLd(item);
    default:
      // Exhaustive over ContentType; fall back to a generic Article.
      return articleJsonLd(item, "Article");
  }
}
