/**
 * Parses the === IMAGES === block of an article run into structured entries,
 * and builds per-image Claude design prompts (screenshot entries get a
 * capture note instead — no prompt needed).
 */

export interface ImageEntry {
  n: number;
  isCover: boolean;
  type: "screenshot" | "design" | "unknown";
  size: string; // e.g. "1600x900"
  placement: string | null;
  shows: string;
  capture: string | null;
  brief: string | null;
  raw: string;
}

const IMAGE_SIZES: Record<string, string> = {
  "1600x900": "1600×900 (16:9) — full article-column width, the house default",
  "1200x800": "1200×800 (3:2) — denser diagrams",
  "1200x1200": "1200×1200 (1:1) — small square concept",
};

export function parseImagesBlock(spec: string | null): ImageEntry[] {
  if (!spec) return [];
  const chunks = spec
    .split(/^(?=IMAGE\s+\d+|COVER\s*$)/im)
    .filter((c) => /^(IMAGE\s+\d+|COVER)/i.test(c.trim()));
  return chunks.map((chunk) => {
    const isCover = /^COVER/i.test(chunk.trim());
    const n = isCover ? 0 : Number(chunk.match(/^IMAGE\s+(\d+)/i)?.[1] ?? 0);
    const field = (name: string) =>
      chunk.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=^(?:TYPE|SIZE|PLACEMENT|SHOWS|CAPTURE|BRIEF|IMAGE\\s+\\d+|COVER):?|$)`, "im"))?.[1]?.trim() || null;
    const typeRaw = (field("TYPE") ?? "").toLowerCase();
    const type = typeRaw.includes("screenshot")
      ? ("screenshot" as const)
      : typeRaw.includes("design")
        ? ("design" as const)
        : ("unknown" as const);
    const sizeRaw = field("SIZE")?.match(/\d{3,4}x\d{3,4}/)?.[0];
    return {
      n,
      isCover,
      type,
      size: isCover ? "1600x900" : sizeRaw && IMAGE_SIZES[sizeRaw] ? sizeRaw : "1600x900",
      placement: field("PLACEMENT"),
      shows: field("SHOWS") ?? "",
      capture: field("CAPTURE"),
      brief: field("BRIEF"),
      raw: chunk.trim(),
    };
  });
}

export function buildImageDesignPrompt(entry: ImageEntry): string {
  const sizeNote = IMAGE_SIZES[entry.size] ?? IMAGE_SIZES["1600x900"];
  return [
    entry.isCover
      ? "Create a blog cover image from the brief below."
      : "Create a blog diagram from the brief below.",
    "",
    "Use the Clovion design system in this workspace for all visual decisions",
    "(colors, typography, line style, iconography). Do not invent new styles.",
    `Shape: ${sizeNote}.`,
    ...(entry.isCover
      ? [
          "This cover also serves as the social-share image, which crops to a",
          "wide 1.91:1 band — keep the title phrase and key elements inside",
          "the central horizontal band.",
        ]
      : []),
    "",
    `WHAT IT SHOWS: ${entry.shows}`,
    "",
    "BRIEF (build exactly this, keep all labels verbatim):",
    entry.brief ?? entry.shows,
  ].join("\n");
}
