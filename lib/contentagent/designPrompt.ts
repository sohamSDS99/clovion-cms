/**
 * Builds ready-to-paste Claude Design prompts from a run's specs.
 *
 * Prompts defer all visual decisions to the Clovion design system inside
 * Claude Design; what they DO pin down is the artboard, per platform —
 * each network renders different sizes, so the shape is channel-derived:
 *
 *  LinkedIn  single: 1080×1350 (4:5) — max feed height on mobile
 *            carousel: PDF document post; 1080×1350 (4:5) pages, ≥30pt type
 *  Instagram single & carousel: 1080×1350 (4:5); grid crops to 3:4, so key
 *            content stays in a centered 3:4 safe zone; ≥50px edge margins
 *  Facebook  single: 1080×1350 (4:5); carousel: 1080×1080 (1:1) squares
 *            (organic multi-photo renders squares most predictably)
 */
import type { AgentRun, AgentChannel } from "@prisma/client";
import { sizeById } from "./sizes";

function artboardSpec(channel: AgentChannel, isCarousel: boolean): string {
  const isLinkedIn = channel === "LINKEDIN_PERSONAL" || channel === "LINKEDIN_COMPANY";
  const isInstagram = channel === "INSTAGRAM";
  const isFacebook = channel === "FACEBOOK";

  if (isCarousel) {
    if (isLinkedIn) {
      return [
        "Shape: LinkedIn document carousel — one 1080×1350 (4:5 portrait)",
        "artboard per slide, in order, designed to be exported as a",
        "multi-page PDF. Type at 30pt equivalent or larger; keep text at",
        "least 50px from every edge.",
      ].join("\n");
    }
    if (isInstagram) {
      return [
        "Shape: Instagram carousel — one 1080×1350 (4:5 portrait) artboard",
        "per slide, identical ratio on every slide (the first slide locks",
        "the ratio). The profile grid crops to 3:4: keep titles, key numbers,",
        "and logos inside a centered 3:4 safe zone, and all text ≥50px from",
        "the edges.",
      ].join("\n");
    }
    // Facebook (and any other social) — squares render most predictably
    // in organic multi-photo posts.
    return [
      "Shape: Facebook multi-image post — one 1080×1080 (1:1 square)",
      "artboard per slide, identical on every slide; text ≥50px from edges.",
    ].join("\n");
  }

  // Single infographic image.
  if (isInstagram) {
    return [
      "Shape: one portrait artboard, 1080×1350 (4:5). The profile grid",
      "crops to 3:4 — keep the title and key content inside a centered 3:4",
      "safe zone, text ≥50px from the edges.",
    ].join("\n");
  }
  if (isFacebook || isLinkedIn) {
    return "Shape: one portrait artboard, 1080×1350 (4:5) — maximum feed height on mobile.";
  }
  return "Shape: one portrait artboard, 4:5 (1080×1350).";
}

function platformNotes(channel: AgentChannel, isCarousel: boolean): string {
  const notes: string[] = [];
  if (channel === "INSTAGRAM") {
    notes.push(
      "Instagram's profile grid crops to 3:4 — keep titles, key numbers, and logos inside a centered 3:4 safe zone."
    );
  }
  if (isCarousel && (channel === "LINKEDIN_PERSONAL" || channel === "LINKEDIN_COMPANY")) {
    notes.push(
      "LinkedIn carousels are document posts: design for export as a multi-page PDF, type at 30pt equivalent or larger."
    );
  }
  notes.push("Keep all text at least 50px from every edge.");
  return notes.join(" ");
}

export function buildDesignPrompt(run: AgentRun): string {
  const isCarousel = run.format === "carousel";
  const size = sizeById(run.channel, run.format, run.designSize);
  const sizeLine = size
    ? `${isCarousel ? "One artboard per slide, identical on every slide: " : "Artboard: "}${size.note}`
    : null;
  return [
    isCarousel
      ? "Create a social media carousel from the slide spec below."
      : "Create a social media infographic from the graphic spec below.",
    "",
    "Use the Clovion design system in this workspace for all visual decisions",
    "(colors, typography, spacing, iconography). Do not invent new styles.",
    "",
    sizeLine ?? artboardSpec(run.channel, isCarousel),
    ...(sizeLine ? [platformNotes(run.channel, isCarousel)] : []),
    "The [highlight]…[/highlight] phrase in the title gets the design system's highlight treatment.",
    "",
    "CONTENT (use this copy verbatim — do not rewrite it):",
    "",
    run.specText ?? run.draftText ?? "",
  ].join("\n");
}
