/**
 * Knowledge Base source text extraction (§7.1 ingestion, FR-SETTINGS-02).
 *
 * Turns a KnowledgeBaseItem source into plain, embeddable text.
 *
 * Source handling:
 *  - PASTED_TEXT: passthrough (raw is already plain text).
 *  - URL:         fetch the URL, strip <script>/<style>/tags to readable text.
 *  - PDF:         parse binary bytes with `pdf-parse` (dynamically imported).
 *  - DOC:         parse .docx bytes with `mammoth.extractRawText` (dynamic import).
 *
 * For PDF/DOC the caller may supply the raw bytes (a Buffer or a base64 string)
 * via the `binary` argument; we run the appropriate parser. When no binary is
 * supplied we fall back to treating `raw` as already-extracted text (the upload
 * pipeline may have run extraction before persisting) so existing behavior is
 * preserved. Parsers are dynamically imported INSIDE the function so the native
 * deps never load at module top (keeps imports cheap + test-safe).
 */
import { BadRequestError } from "@/lib/api/http";

export type KbSourceType = "DOC" | "URL" | "PASTED_TEXT" | "PDF";

/** Max bytes we'll read from a remote URL to avoid unbounded fetches. */
const MAX_URL_BYTES = 5_000_000;

/** Raw binary input for DOC/PDF extraction — a Node Buffer or base64 string. */
export type BinaryInput = Buffer | string;

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

/** Normalize a Buffer | base64 string into a Buffer for the binary parsers. */
function toBuffer(binary: BinaryInput): Buffer {
  if (Buffer.isBuffer(binary)) return binary;
  // Treat strings as base64-encoded bytes.
  return Buffer.from(binary, "base64");
}

/**
 * Extract text from PDF bytes using `pdf-parse` (dynamically imported so the
 * native dep never loads at module top). Honest error on parse failure.
 */
async function extractFromPdf(binary: BinaryInput): Promise<string> {
  const buffer = toBuffer(binary);
  try {
    // pdf-parse exports a CJS default function; interop-safe access.
    const mod = (await import("pdf-parse")) as unknown as {
      default?: (data: Buffer) => Promise<{ text: string }>;
    };
    const pdfParse =
      mod.default ?? (mod as unknown as (data: Buffer) => Promise<{ text: string }>);
    const result = await pdfParse(buffer);
    return (result.text ?? "").trim();
  } catch (err) {
    throw new BadRequestError(
      `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Extract text from .docx bytes using `mammoth.extractRawText` (dynamic import).
 * Honest error on parse failure.
 */
async function extractFromDocx(binary: BinaryInput): Promise<string> {
  const buffer = toBuffer(binary);
  try {
    const mammoth = (await import("mammoth")) as unknown as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? "").trim();
  } catch (err) {
    throw new BadRequestError(
      `Failed to parse DOCX: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Extracts plain text for the given source. `raw` is the stored
 * `KnowledgeBaseItem.rawContent` (for URL it holds the URL string; for DOC/PDF
 * it may hold already-extracted text). `binary` carries raw bytes for DOC/PDF
 * uploads when available — when present it takes precedence over `raw`.
 */
export async function extractText(
  sourceType: KbSourceType,
  raw: string,
  binary?: BinaryInput | null
): Promise<string> {
  switch (sourceType) {
    case "PASTED_TEXT":
      return (raw ?? "").trim();

    case "URL":
      return extractFromUrl(raw);

    case "PDF":
      // Prefer parsing supplied bytes; otherwise fall back to pre-extracted text.
      return binary ? extractFromPdf(binary) : (raw ?? "").trim();

    case "DOC":
      // Prefer parsing supplied .docx bytes; otherwise pre-extracted text.
      return binary ? extractFromDocx(binary) : (raw ?? "").trim();

    default: {
      // Exhaustiveness guard — should be unreachable given the union.
      const never: never = sourceType;
      throw new BadRequestError(`Unsupported source type: ${String(never)}`);
    }
  }
}
