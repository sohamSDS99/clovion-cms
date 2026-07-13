/**
 * UI selection tree for the Content Agent form: Channel → Profile →
 * Content type → Angle, with pure resolution to the run parameters
 * (AgentChannel enum + format + postType). Dropdowns are dynamic: a level
 * only renders when the level above requires it.
 */
import type { AgentChannel } from "@prisma/client";
import { channelSpec } from "./channels";

export interface UiOption {
  id: string;
  label: string;
}

export const UI_CHANNELS: UiOption[] = [
  { id: "LINKEDIN", label: "LinkedIn" },
  { id: "FACEBOOK", label: "Facebook" },
  { id: "INSTAGRAM", label: "Instagram" },
  { id: "WEBSITE", label: "Website" },
];

export const LINKEDIN_PROFILES: UiOption[] = [
  { id: "personal", label: "Zahir's profile" },
  { id: "company", label: "Clovion company page" },
];

export const SOCIAL_CONTENT_TYPES: UiOption[] = [
  { id: "text-post", label: "Single static" },
  { id: "infographic", label: "Infographic post" },
  { id: "carousel", label: "Carousel post" },
];

export const WEBSITE_CONTENT_TYPES: UiOption[] = [
  { id: "blog-article", label: "Blog article" },
  { id: "course-outline", label: "Course outline" },
  { id: "course-lesson", label: "Course lesson" },
  { id: "lead-magnet", label: "Lead magnet" },
];

/** Profile options for a UI channel (null = no profile dropdown). */
export function profilesFor(uiChannel: string): UiOption[] | null {
  return uiChannel === "LINKEDIN" ? LINKEDIN_PROFILES : null;
}

/** Content-type options for a UI channel. */
export function contentTypesFor(uiChannel: string): UiOption[] {
  return uiChannel === "WEBSITE" ? WEBSITE_CONTENT_TYPES : SOCIAL_CONTENT_TYPES;
}

/** Resolve the underlying AgentChannel for a UI selection. */
export function resolveChannel(
  uiChannel: string,
  profile: string | null,
  contentType: string
): AgentChannel {
  switch (uiChannel) {
    case "LINKEDIN":
      return profile === "company" ? "LINKEDIN_COMPANY" : "LINKEDIN_PERSONAL";
    case "FACEBOOK":
      return "FACEBOOK";
    case "INSTAGRAM":
      return "INSTAGRAM";
    case "WEBSITE":
      return contentType === "lead-magnet" ? "WEBSITE" : "BLOG_ARTICLE";
    default:
      throw new Error(`Unknown channel: ${uiChannel}`);
  }
}

/** Angle options for a full selection (null = no angle dropdown). */
export function anglesFor(
  uiChannel: string,
  profile: string | null,
  contentType: string
): UiOption[] | null {
  if (uiChannel === "WEBSITE") {
    if (contentType === "course-outline" || contentType === "course-lesson") {
      return null; // the content type IS the post type
    }
    const spec = channelSpec(resolveChannel(uiChannel, profile, contentType));
    // Blog articles: exclude the course post types (they're content types now).
    return spec.postTypes.filter(
      (p) => !["course-outline", "course-lesson"].includes(p.id)
    );
  }
  const spec = channelSpec(resolveChannel(uiChannel, profile, contentType));
  return spec.postTypes;
}

/** Whether the source-report textarea should show for this selection. */
export function needsSourceReport(
  uiChannel: string,
  contentType: string,
  angle: string | null
): boolean {
  return uiChannel === "WEBSITE" && contentType === "blog-article" && angle === "from-report";
}

export interface ResolvedSelection {
  channel: AgentChannel;
  format?: string;
  postType: string;
}

/** Resolve the whole selection into run-creation parameters. */
export function resolveSelection(
  uiChannel: string,
  profile: string | null,
  contentType: string,
  angle: string | null
): ResolvedSelection {
  const channel = resolveChannel(uiChannel, profile, contentType);
  if (uiChannel === "WEBSITE") {
    if (contentType === "course-outline") return { channel, postType: "course-outline" };
    if (contentType === "course-lesson") return { channel, postType: "course-lesson" };
    // blog-article and lead-magnet use the angle as the post type
    return { channel, postType: angle ?? channelSpec(channel).postTypes[0].id };
  }
  // Social: content type maps to the visual format; angle is the post type.
  const format =
    contentType === "infographic" ? "infographic" : contentType === "carousel" ? "carousel" : "static";
  return { channel, format, postType: angle ?? channelSpec(channel).postTypes[0].id };
}
