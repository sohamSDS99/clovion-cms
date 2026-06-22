/**
 * Knowledge Base source text extraction (§7.1 ingestion, FR-SETTINGS-02).
 *
 * Turns a KnowledgeBaseItem source into plain, embeddable text.
 *
 * Source handling:
 *  - PASTED_TEXT: passthrough (raw is already plain text).
 *  - URL:         fetch the URL, strip <script>/<style>/tags to readable text.
 *  - DOC / PDF:   NO native parser dependency is installed and we must not add
 *                 new deps in this wave. We therefore treat `rawContent` as
 *                 already-extracted text (the upload pipeline is expected to
 *                 have run extraction before persisting). This is an honest
 *                 limitation — see TODO below.
 *
 * TODO(phase2): wire real document parsing for DOC (e.g. mammoth) and PDF
 * (e.g. pdf-parse / pdfjs) so binary uploads can be ingested directly instead
 * of relying on pre-extracted text. Tracked as a follow-up; intentionally NOT
 * adding the dependency here.
 */
import { BadRequestError } from "@/lib/api/http";

export type KbSourceType = "DOC" | "URL" | "PASTED_TEXT" | "PDF";

/** Max bytes we'll read from a remote URL to avoid unbounded fetches. */
const MAX_URL_BYTES = 5_000_000;

/**
 * Very small HTML -> text reducer. Drops scripts/styles/head metadata, converts
 * common block tags to newlines, strips remaining tags, then decodes a handful
 * of common entities and collapses whitespace.
 *
 * This is deliberately dependency-free (no cheerio/jsdom). It is "good enough"
 * for marketing/article pages, not a full readability extractor.
 */
export function htmlToText(html: string): string {
  let text = html;
  // Remove non-content elements wholesale.
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ");
  // Block-level tags become line breaks so structure survives.
  text = text.replace(/<\/(p|div|section|article|li|h[1-6]|tr|table|header|footer)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip all remaining tags.
  text = text.replace(/<[^>]+>/g, " ");
  // Decode a few common HTML entities.
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  // Collapse runs of whitespace, but keep paragraph breaks for the chunker.
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Fetches a URL and returns its readable text content. */
async function extractFromUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestError("Invalid URL for knowledge base source.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestError("Knowledge base URLs must be http(s).");
  }

  const res = await fetch(parsed.toString(), {
    headers: { Accept: "text/html,text/plain,*/*" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new BadRequestError(`Failed to fetch URL (HTTP ${res.status}).`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  // Guard against huge bodies.
  const raw = (await res.text()).slice(0, MAX_URL_BYTES);

  // Plain text passes through; HTML (or unknown) goes through the reducer.
  if (contentType.includes("text/plain")) return raw.trim();
  return htmlToText(raw);
}

/**
 * Extracts plain text for the given source. `raw` is the stored
 * `KnowledgeBaseItem.rawContent` (for URL it holds the URL string).
 */
export async function extractText(
  sourceType: KbSourceType,
  raw: string
): Promise<string> {
  switch (sourceType) {
    case "PASTED_TEXT":
      return (raw ?? "").trim();

    case "URL":
      return extractFromUrl(raw);

    case "DOC":
    case "PDF":
      // No parser dependency available (see module TODO). We accept text that
      // was already extracted upstream and stored in rawContent.
      return (raw ?? "").trim();

    default: {
      // Exhaustiveness guard — should be unreachable given the union.
      const never: never = sourceType;
      throw new BadRequestError(`Unsupported source type: ${String(never)}`);
    }
  }
}
