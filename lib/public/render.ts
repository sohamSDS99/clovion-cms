/**
 * Tiptap JSON -> HTML renderer for the PUBLIC read API (NFR-SEO-01).
 *
 * The public site consumes server-rendered HTML, so we render the stored Tiptap
 * `body` document to a string here. We deliberately reuse the SAME extension set
 * the editor uses (StarterKit + Underline + Link + Image + Table family) so that
 * what authors see in the editor is what ships to the site.
 *
 * SECURITY: only the extensions in `editorExtensions` can emit nodes/marks —
 * an implicit allow-list (no raw HTML pass-through, no <script>, no arbitrary
 * attributes). SmartLink hardens rel/target so user-supplied URLs cannot leak
 * the referrer or gain window.opener access.
 *
 * The extension set MUST be the editor's own (`lib/editor/config`): a node the
 * editor can produce but this renderer does not register makes generateHTML
 * throw, which we swallow into an empty body — i.e. schema drift silently blanks
 * published posts. Never keep a local copy of the list here.
 */

import { generateHTML } from "@tiptap/html";
import { editorExtensions } from "@/lib/editor/config";

/** A minimal Tiptap/ProseMirror JSON document shape. */
export interface TiptapDoc {
  type: "doc";
  content?: unknown[];
}

/** True when a value looks like a non-empty Tiptap doc node. */
function isTiptapDoc(value: unknown): value is TiptapDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc"
  );
}

/** True for a paragraph node with no inline content (an empty `<p></p>`). */
function isEmptyParagraph(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const n = node as { type?: unknown; content?: unknown };
  if (n.type !== "paragraph") return false;
  return !Array.isArray(n.content) || n.content.length === 0;
}

/**
 * Drop top-level empty paragraphs. Authors (and pasted/imported content) often
 * leave blank paragraphs as visual spacers — `{type:"paragraph"}` with no
 * content — which render as empty `<p></p>`. Those carry no meaning, produce
 * messy markup, and (once real inter-paragraph spacing exists in CSS) are
 * redundant. We only touch the top level; nested empties are rare and left as-is.
 */
export function stripEmptyParagraphs(content: unknown[]): unknown[] {
  return content.filter((node) => !isEmptyParagraph(node));
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
  const content = stripEmptyParagraphs(
    Array.isArray(doc.content) ? doc.content : [],
  );
  if (content.length === 0) return "";

  try {
    // generateHTML only emits nodes/marks defined by editorExtensions (the
    // allow-list); an unknown node type throws and lands in the catch below.
    // generateHTML expects a JSONContent doc; our validated doc is structurally compatible.
    return generateHTML(
      { ...doc, content } as unknown as Record<string, unknown>,
      editorExtensions,
    );
  } catch (err) {
    // Defensive: a corrupt document should yield empty HTML, not a 500.
    console.error("[public/render] failed to render Tiptap doc:", err);
    return "";
  }
}
