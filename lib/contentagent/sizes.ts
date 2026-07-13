/**
 * Supported artboard sizes per social platform + visual format.
 * The first entry is the platform-recommended default; "auto" in the UI lets
 * the orchestrator pick based on the content itself.
 */
import type { AgentChannel } from "@prisma/client";

export interface SizeOption {
  id: string; // e.g. "1080x1350"
  label: string; // e.g. "Portrait 4:5 — 1080×1350 (recommended)"
  note: string; // guidance injected into the design prompt
}

const P45: SizeOption = {
  id: "1080x1350",
  label: "Portrait 4:5 — 1080×1350",
  note: "1080×1350 (4:5 portrait) — maximum feed height on mobile.",
};
const SQ: SizeOption = {
  id: "1080x1080",
  label: "Square 1:1 — 1080×1080",
  note: "1080×1080 (1:1 square).",
};
const LS: SizeOption = {
  id: "1200x627",
  label: "Landscape 1.91:1 — 1200×627",
  note: "1200×627 (1.91:1 landscape) — link-preview shaped; use only when the content is a single wide visual.",
};

export function sizeOptionsFor(
  channel: AgentChannel,
  format: string | null
): SizeOption[] | null {
  if (format !== "infographic" && format !== "carousel") return null;
  const isLinkedIn =
    channel === "LINKEDIN_PERSONAL" || channel === "LINKEDIN_COMPANY";
  if (isLinkedIn) {
    return format === "carousel" ? [P45, SQ] : [P45, SQ, LS];
  }
  if (channel === "INSTAGRAM") return [P45, SQ];
  if (channel === "FACEBOOK") return format === "carousel" ? [SQ, P45] : [P45, SQ, LS];
  return [P45, SQ];
}

export function isValidSize(
  channel: AgentChannel,
  format: string | null,
  sizeId: string
): boolean {
  return Boolean(sizeOptionsFor(channel, format)?.some((s) => s.id === sizeId));
}

export function sizeById(
  channel: AgentChannel,
  format: string | null,
  sizeId: string | null
): SizeOption | null {
  const options = sizeOptionsFor(channel, format);
  if (!options) return null;
  return options.find((s) => s.id === sizeId) ?? options[0];
}
