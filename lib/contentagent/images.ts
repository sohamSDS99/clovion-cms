/**
 * Parses the === IMAGES === block of an article run into structured entries,
 * and builds per-image Claude design prompts (screenshot entries get a
 * capture note instead — no prompt needed).
 */

export interface ImageEntry {
  n: number;
  type: "screenshot" | "design" | "unknown";
  placement: string | null;
  shows: string;
  capture: string | null;
  brief: string | null;
  raw: string;
}

export function parseImagesBlock(spec: string | null): ImageEntry[] {
  if (!spec) return [];
  const chunks = spec.split(/^(?=IMAGE\s+\d+)/im).filter((c) => /^IMAGE\s+\d+/i.test(c.trim()));
  return chunks.map((chunk) => {
    const n = Number(chunk.match(/^IMAGE\s+(\d+)/i)?.[1] ?? 0);
    const field = (name: string) =>
      chunk.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=^(?:TYPE|PLACEMENT|SHOWS|CAPTURE|BRIEF|IMAGE\\s+\\d+):?|$)`, "im"))?.[1]?.trim() || null;
    const typeRaw = (field("TYPE") ?? "").toLowerCase();
    const type = typeRaw.includes("screenshot")
      ? ("screenshot" as const)
      : typeRaw.includes("design")
        ? ("design" as const)
        : ("unknown" as const);
    return {
      n,
      type,
      placement: field("PLACEMENT"),
      shows: field("SHOWS") ?? "",
      capture: field("CAPTURE"),
      brief: field("BRIEF"),
      raw: chunk.trim(),
    };
  });
}

export function buildImageDesignPrompt(entry: ImageEntry): string {
  return [
    "Create a blog diagram from the brief below.",
    "",
    "Use the Clovion design system in this workspace for all visual decisions",
    "(colors, typography, line style, iconography). Do not invent new styles.",
    "Shape: landscape 16:9 (1600×900), readable at blog column width.",
    "",
    `WHAT IT SHOWS: ${entry.shows}`,
    "",
    "BRIEF (build exactly this, keep all labels verbatim):",
    entry.brief ?? entry.shows,
  ].join("\n");
}
