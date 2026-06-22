/**
 * Convert model-generated HTML into a sanitized Tiptap document JSON (§6.1).
 *
 * The model is instructed (OUTPUT CONTRACT) to return HTML restricted to the
 * editor's allowed node set. We do NOT trust that — we parse with the SAME
 * Tiptap extension set the editor/renderer uses, so `@tiptap/html` `generateJSON`
 * silently DROPS any node/mark/attribute it doesn't recognise. That gives an
 * implicit allow-list (no <script>, no raw HTML pass-through, no arbitrary attrs).
 *
 * On malformed input (or a result with no meaningful text) we fall back to a
 * single paragraph carrying the raw text and flag `needsReview` so the editor can
 * surface a "review before publish" state.
 *
 * PURE + testable: takes an HTML string, returns a doc + diagnostics. No I/O.
 *
 * NOTE: this intentionally redefines the extension list locally rather than
 * importing `lib/editor/config` — that module pulls in `@tiptap/react`
 * (a client/React dependency) which we must not load in a server/Node path.
 * The set below mirrors `lib/editor/config#editorExtensions` and the public
 * renderer's set. TODO(dedupe): extract a framework-agnostic shared extension
 * list both can import.
 */

import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

/** Minimal Tiptap/ProseMirror doc shape. */
export interface TiptapDoc {
  type: "doc";
  content: unknown[];
}

export interface CoerceResult {
  /** A Tiptap "doc" node, always structurally valid (never empty content). */
  doc: TiptapDoc;
  /** True when parsing failed and the fallback doc was produced. */
  needsReview: boolean;
}

/**
 * Editor-mirroring extension set. Headings constrained to H2–H4 to match the
 * editor (H1 is the content title). Anything not produced by these extensions is
 * dropped during generateJSON, enforcing the allowed node set.
 */
const COERCE_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: false,
    protocols: ["http", "https", "mailto", "tel"],
    HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
  }),
  Image.configure({ inline: false, allowBase64: false }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
];

/** Strip a leading/trailing markdown code fence the model may have added. */
function stripCodeFence(html: string): string {
  const trimmed = html.trim();
  const fence = /^```(?:html)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

/** A safe fallback doc wrapping raw text in a paragraph (for human review). */
function fallbackDoc(raw: string): TiptapDoc {
  const text = raw.trim();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function isDocNode(value: unknown): value is TiptapDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc"
  );
}

/** Recursively test whether a node subtree contains any non-empty text. */
function hasText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text" && typeof n.text === "string" && n.text.trim()) {
    return true;
  }
  if (Array.isArray(n.content)) return n.content.some(hasText);
  return false;
}

/**
 * Convert sanitized model HTML to a Tiptap doc JSON. Never throws.
 */
export function htmlToTiptap(html: string): CoerceResult {
  const cleaned = stripCodeFence(html ?? "");

  if (!cleaned) {
    return { doc: fallbackDoc(""), needsReview: true };
  }

  try {
    const parsed = generateJSON(cleaned, COERCE_EXTENSIONS) as unknown;

    if (!isDocNode(parsed)) {
      return { doc: fallbackDoc(cleaned), needsReview: true };
    }

    const content = Array.isArray(parsed.content) ? parsed.content : [];

    // Fall back when the parse yielded nothing meaningful — e.g. the input was
    // only disallowed tags that all got dropped, leaving an empty paragraph. We
    // never want the editor to silently swallow the model's output.
    const meaningful = content.length > 0 && content.some(hasText);
    if (!meaningful) {
      return { doc: fallbackDoc(cleaned), needsReview: true };
    }

    return { doc: { type: "doc", content }, needsReview: false };
  } catch (err) {
    console.error("[ai/coerce] htmlToTiptap parse failed:", err);
    return { doc: fallbackDoc(cleaned), needsReview: true };
  }
}
