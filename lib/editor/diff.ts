/**
 * Pure, framework-free diff helpers for the revision compare UX (FR-CONTENT-10).
 *
 * No external deps and no Prisma/React imports — these stay trivially unit
 * testable and can run on the client (the RevisionDrawer) or the server.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Tiptap document JSON (opaque structurally; we only walk content/text). */
export type TiptapDoc = Record<string, unknown>;

interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
}

/** A single line in a line-level diff. */
export interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

/** One changed scalar field (SEO or typeData). */
export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

/** Minimal revision snapshot shape consumed by {@link diffRevisions}. */
export interface RevisionSnapshot {
  body: TiptapDoc;
  seo?: Record<string, unknown> | null;
  typeData?: Record<string, unknown> | null;
}

/** Result of comparing two revision snapshots. */
export interface RevisionDiff {
  body: DiffLine[];
  seoChanged: FieldChange[];
  typeDataChanged: FieldChange[];
}

/* -------------------------------------------------------------------------- */
/* Tiptap flattening                                                          */
/* -------------------------------------------------------------------------- */

/** Block node types that should each occupy their own line(s). */
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
  "codeBlock",
]);

/** Concatenate all text within a node subtree (inline-level join). */
function collectText(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  // hardBreak nodes carry no text; joining with "" keeps inline runs together.
  return node.content.map(collectText).join("");
}

/**
 * Flatten a Tiptap doc to readable plain text. Headings, paragraphs, list
 * items, blockquotes and code blocks each become their own line so that the
 * downstream line diff is meaningful. Empty blocks are preserved as blank
 * lines (they still represent structure the author may have changed).
 */
export function tiptapToPlainText(doc: TiptapDoc | null | undefined): string {
  if (!doc || typeof doc !== "object") return "";
  const lines: string[] = [];

  function walk(node: TiptapNode): void {
    const type = node.type;

    // Block-level node: emit its collected text as a line, then recurse only
    // for container blocks (lists) whose children are themselves blocks.
    if (type && BLOCK_TYPES.has(type)) {
      if (type === "listItem" || type === "blockquote") {
        // These wrap paragraphs — recurse so nested paragraphs each get a line.
        if (Array.isArray(node.content)) node.content.forEach(walk);
      } else {
        lines.push(collectText(node));
      }
      return;
    }

    // List containers / doc / anything else: recurse into children.
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  walk(doc as TiptapNode);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Line-level LCS diff                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Simple line-level diff using a longest-common-subsequence DP table, then a
 * backtrack to classify each line as same/added/removed. O(n*m) time/space —
 * fine for revision-sized documents and avoids pulling a diff dependency.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Dropping a[i] keeps the longer subsequence -> it was removed.
      out.push({ type: "removed", text: a[i] });
      i++;
    } else {
      out.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "removed", text: a[i++] });
  while (j < m) out.push({ type: "added", text: b[j++] });

  return out;
}

/* -------------------------------------------------------------------------- */
/* Field (SEO / typeData) change detection                                    */
/* -------------------------------------------------------------------------- */

/** Render a field value as a stable, human-readable string for comparison. */
function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Compare two flat-ish records and return the fields that differ. Nested
 * objects/arrays are compared by their JSON serialization, which is sufficient
 * for surfacing "this field changed" in the UI.
 */
function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): FieldChange[] {
  const a = before ?? {};
  const b = after ?? {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();

  const changes: FieldChange[] = [];
  for (const field of keys) {
    const beforeStr = stringifyValue(a[field]);
    const afterStr = stringifyValue(b[field]);
    if (beforeStr !== afterStr) {
      changes.push({ field, before: beforeStr, after: afterStr });
    }
  }
  return changes;
}

/* -------------------------------------------------------------------------- */
/* Revision-level diff                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Diff two revision snapshots: a line diff of their flattened bodies plus the
 * list of changed SEO and typeData fields. `a` is the older/"before" snapshot,
 * `b` is the newer/"after" snapshot.
 */
export function diffRevisions(
  a: RevisionSnapshot,
  b: RevisionSnapshot
): RevisionDiff {
  return {
    body: diffLines(tiptapToPlainText(a.body), tiptapToPlainText(b.body)),
    seoChanged: diffFields(a.seo, b.seo),
    typeDataChanged: diffFields(a.typeData, b.typeData),
  };
}
