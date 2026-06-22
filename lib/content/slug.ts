/**
 * Slug generation + per-type uniqueness (FR-CONTENT-02).
 *
 * `ContentItem.slug` is unique PER content type (`@@unique([type, slug])`),
 * so dedupe queries are always scoped by `type`.
 */

import { prisma } from "@/lib/db/prisma";
import type { ContentType } from "@prisma/client";

/**
 * Convert a title to a kebab-case slug constrained to the charset [a-z0-9-].
 * Diacritics are stripped, non-alphanumerics collapse to single hyphens, and
 * leading/trailing hyphens are trimmed.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD") // split accented chars into base + diacritic
    .replace(/[̀-ͯ]/g, "") // drop diacritic marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics -> hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-"); // collapse repeats
}

/**
 * Ensure `base` is unique within `type`, appending `-2`, `-3`, … on collision.
 * `excludeId` lets an update keep its own slug without colliding with itself.
 *
 * If `base` is empty (e.g. a title of only symbols), falls back to "untitled".
 */
export async function ensureUniqueSlug(
  type: ContentType,
  base: string,
  excludeId?: string
): Promise<string> {
  const root = base && base.length > 0 ? base : "untitled";

  // Pull all existing slugs in this type that share the root prefix so we can
  // pick the lowest free suffix in one query rather than N round-trips.
  const existing = await prisma.contentItem.findMany({
    where: {
      type,
      slug: { startsWith: root },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });
  const taken = new Set(existing.map((r) => r.slug));

  if (!taken.has(root)) return root;

  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
