/**
 * Interlink-aware Link mark.
 *
 * The default config forced `rel="noopener noreferrer nofollow"` + `target="_blank"`
 * onto EVERY link via static HTMLAttributes. That rewrote pasted internal links
 * ("interlinks" — relative paths to other CMS pages) as external nofollow links,
 * so pasting from a copied doc silently changed link intent.
 *
 * SmartLink instead computes rel/target from the href at render time:
 *   - internal / relative links keep `_self` and drop `nofollow` (still `noopener`)
 *   - mailto:/tel: get no target/rel
 *   - external http(s) links keep `_blank` + `nofollow`
 */

import Link from "@tiptap/extension-link";
import { mergeAttributes } from "@tiptap/react";

/** True for hrefs that point within the site (relative paths, anchors, queries). */
export function isInternalHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const h = href.trim();
  if (h === "") return false;
  // Relative paths, in-page anchors and bare query strings are internal.
  if (h.startsWith("/") || h.startsWith("#") || h.startsWith("?")) return true;
  // Any explicit scheme (http:, https:, mailto:, tel:, …) is not an internal path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return false;
  // No scheme and not absolute → a relative link like "team/about".
  return true;
}

/** True for mailto:/tel: links, which should carry no target/rel. */
function isMailOrTel(href: string | null | undefined): boolean {
  return /^(mailto|tel):/i.test(String(href ?? "").trim());
}

/** Compute the rel/target pair for a given href. */
export function linkRelTarget(href: string | null | undefined): {
  rel: string | null;
  target: string | null;
} {
  if (isMailOrTel(href)) return { rel: null, target: null };
  if (isInternalHref(href)) return { rel: "noopener", target: null };
  return { rel: "noopener noreferrer nofollow", target: "_blank" };
}

export const SmartLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const attrs = { ...(HTMLAttributes as Record<string, unknown>) };
    const href = attrs.href as string | undefined;
    const { rel, target } = linkRelTarget(href);
    if (rel === null) delete attrs.rel;
    else attrs.rel = rel;
    if (target === null) delete attrs.target;
    else attrs.target = target;
    return ["a", mergeAttributes(this.options.HTMLAttributes, attrs), 0];
  },
});
