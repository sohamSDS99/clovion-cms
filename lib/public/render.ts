/**
 * Tiptap JSON -> HTML renderer for the PUBLIC read API (NFR-SEO-01).
 *
 * The public site consumes server-rendered HTML, so we render the stored Tiptap
 * `body` document to a string here. We deliberately reuse the SAME extension set
 * the editor uses (StarterKit + Underline + Link + Image + Table family) so that
 * what authors see in the editor is what ships to the site.
 *
 * SECURITY: only the extensions registered below can emit nodes/marks. Anything
 * the parser does not recognise is dropped, which gives us an implicit allow-list
 * (no raw HTML pass-through, no <script>, no arbitrary attributes). We also harden
 * Link with rel/target defaults so user-supplied URLs cannot leak the referrer or
 * gain window.opener access.
 *
 * TODO(dedupe): the editor extension list lives in `lib/editor/config` (owned by
 * another agent and not yet importable). When it exists, import that module and
 * delete the local definition below so the editor and the renderer cannot drift.
 */

import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { SmartLink } from "@/lib/editor/link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

/** A minimal Tiptap/ProseMirror JSON document shape. */
export interface TiptapDoc {
  type: "doc";
  content?: unknown[];
}

/**
 * Editor extension set — kept local until `lib/editor/config` is available.
 * Order does not matter for HTML generation, only the set of registered schemas.
 */
const EDITOR_EXTENSIONS = [
  // StarterKit covers: doc, paragraph, text, heading, bold, italic, strike,
  // code, codeBlock, blockquote, bulletList, orderedList, listItem,
  // horizontalRule, hardBreak, history, dropcursor, gapcursor.
  StarterKit,
  Underline,
  // Harden links: no JS schemes; SmartLink computes rel/target per-href so
  // external links stay nofollow+_blank while internal interlinks keep _self.
  SmartLink.configure({
    openOnClick: false,
    autolink: false,
    protocols: ["http", "https", "mailto", "tel"],
  }),
  Image.configure({ inline: false }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
];

/** True when a value looks like a non-empty Tiptap doc node. */
function isTiptapDoc(value: unknown): value is TiptapDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc"
  );
}

/**
 * Render a stored Tiptap document to a sanitized HTML string.
 *
 * Returns an empty string for null / malformed / empty documents so callers can
 * treat "no rendered body" uniformly. Never throws on bad input — the public API
 * must not 500 because a single stored document is malformed.
 */
export function renderTiptapToHtml(doc: unknown): string {
  if (!isTiptapDoc(doc)) return "";
  const content = Array.isArray(doc.content) ? doc.content : [];
  if (content.length === 0) return "";

  try {
    // generateHTML only emits nodes/marks defined by EDITOR_EXTENSIONS; unknown
    // nodes are silently dropped, giving us the allow-list guarantee.
    // generateHTML expects a JSONContent doc; our validated doc is structurally compatible.
    return generateHTML(doc as unknown as Record<string, unknown>, EDITOR_EXTENSIONS);
  } catch (err) {
    // Defensive: a corrupt document should yield empty HTML, not a 500.
    console.error("[public/render] failed to render Tiptap doc:", err);
    return "";
  }
}
