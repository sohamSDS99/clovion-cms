/**
 * Pure helpers for the in-editor Schema-markup panel (FR-EDITOR-06).
 *
 * JSON-LD is edited as raw text in a textarea; these helpers validate it and
 * extract the generated `@type` for display. Kept React/DOM-free so they are
 * unit-testable and reusable.
 */

export interface JsonLdValidation {
  /** True when the text parses as a JSON object (or array of objects). */
  valid: boolean;
  /** Human-readable parse error, when invalid. */
  error: string | null;
  /** The parsed value, when valid. */
  value: unknown;
}

/**
 * Validate a JSON-LD string. An empty string is treated as "valid but empty"
 * (clearing the field is allowed). Anything non-empty must parse to an object
 * or an array of objects to be considered valid JSON-LD.
 */
export function validateJsonLd(text: string): JsonLdValidation {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { valid: true, error: null, value: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { valid: false, error: parseMessage(err), value: undefined };
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { valid: false, error: "JSON-LD array is empty.", value: parsed };
    }
    const allObjects = parsed.every(
      (x) => x !== null && typeof x === "object" && !Array.isArray(x)
    );
    if (!allObjects) {
      return {
        valid: false,
        error: "Each item in a JSON-LD array must be an object.",
        value: parsed,
      };
    }
    return { valid: true, error: null, value: parsed };
  }
  if (parsed === null || typeof parsed !== "object") {
    return {
      valid: false,
      error: "JSON-LD must be an object or an array of objects.",
      value: parsed,
    };
  }
  return { valid: true, error: null, value: parsed };
}

/** Normalize a JSON parse error into a short, readable message. */
function parseMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Browsers phrase these differently; surface the core message.
  return `Invalid JSON: ${raw}`;
}

/**
 * Extract the schema.org `@type`(s) from parsed JSON-LD for display
 * ("which @type was generated"). Handles a single object, an array of objects,
 * and a `@graph` container. Returns a de-duplicated, ordered list.
 */
export function schemaTypes(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (t: unknown) => {
    if (typeof t === "string" && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    } else if (Array.isArray(t)) {
      for (const x of t) add(x);
    }
  };
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    const obj = node as Record<string, unknown>;
    add(obj["@type"]);
    if (Array.isArray(obj["@graph"])) {
      for (const g of obj["@graph"] as unknown[]) visit(g);
    }
  };
  visit(value);
  return out;
}

/** Pretty-print a JSON value with stable 2-space indentation. */
export function formatJsonLd(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}
