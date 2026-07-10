/**
 * Pure parser for AI FAQ output — no imports, so it stays unit-testable without
 * pulling in the config/auth/next-auth module graph.
 *
 * Extracts a JSON array from a model response that may be wrapped in ```json
 * fences or padded with prose. Returns the parsed value or null on failure.
 */
export function parseFaqJson(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  // If the model added prose around the array, slice the first [...] block.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  const slice =
    start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}
