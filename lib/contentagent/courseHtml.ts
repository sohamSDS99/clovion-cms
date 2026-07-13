/**
 * Pure HTML helpers for course filing. Intentionally dependency-free (no
 * Prisma, no auth) so they stay trivially unit-testable — the DB-bound filing
 * logic lives in courseToCms.ts.
 */

/**
 * Find the "Key learnings" section (an <h2> titled Key learnings, any casing,
 * followed by a <ul>) and split it out of the article HTML.
 *
 * Returns the learnings as plain-text strings (tags stripped — a <strong>
 * lead-in survives as plain text) plus the HTML with that h2+ul removed.
 * When the section is absent the HTML passes through untouched.
 */
export function extractKeyLearnings(html: string): {
  keyLearnings: string[];
  bodyWithoutSection: string;
} {
  const section =
    /<h2[^>]*>\s*key\s+learnings\s*<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>\s*/i.exec(
      html
    );
  if (!section) return { keyLearnings: [], bodyWithoutSection: html };

  const keyLearnings: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li: RegExpExecArray | null;
  while ((li = liRe.exec(section[1])) !== null) {
    const text = li[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) keyLearnings.push(text);
  }

  const bodyWithoutSection = (
    html.slice(0, section.index) + html.slice(section.index + section[0].length)
  ).trim();
  return { keyLearnings, bodyWithoutSection };
}

/** "budget-tracker_v2.xlsx" → "Budget tracker v2" (download label). */
export function humanizeFilename(filename: string): string {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "");
  const words = stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return filename;
  return words.charAt(0).toUpperCase() + words.slice(1);
}


/** Derive a publish-gate-safe meta description (50–160 chars) from HTML. */
export function deriveMetaDescription(html: string): string | null {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 50) return null;
  if (text.length <= 155) return text;
  const cut = text.slice(0, 155);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 100 ? lastSpace : 155).trim()}…`;
}
