/**
 * Builds ready-to-paste Claude Design prompts from a run's specs.
 *
 * These target Claude Design (claude.ai/design), where the Clovion design
 * system lives — so prompts specify CONTENT and ARTIFACT SHAPE only and
 * explicitly defer all visual decisions to the workspace design system.
 */
import type { AgentRun } from "@prisma/client";

export function buildDesignPrompt(run: AgentRun): string {
  const isCarousel = run.format === "carousel";
  return [
    isCarousel
      ? "Create a social media carousel from the slide spec below."
      : "Create a social media infographic from the graphic spec below.",
    "",
    "Use the Clovion design system in this workspace for all visual decisions",
    "(colors, typography, spacing, iconography). Do not invent new styles.",
    "",
    isCarousel
      ? "Shape: one square (1:1, 1080×1080) artboard per slide, in order."
      : "Shape: one portrait artboard, 4:5 (1080×1350).",
    "The [highlight]…[/highlight] phrase in the title gets the design system's highlight treatment.",
    "",
    "CONTENT (use this copy verbatim — do not rewrite it):",
    "",
    run.specText ?? run.draftText ?? "",
  ].join("\n");
}
