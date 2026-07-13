/**
 * Channel registry for the Content Agent.
 *
 * A channel = where the content will live; it decides the output format,
 * the post types offered in the UI, and which voice profile the pipeline uses.
 */
import type { AgentChannel } from "@prisma/client";

export type OutputFormat = "caption" | "article";

export interface SocialFormatSpec {
  id: string;
  label: string;
}

/** Visual formats offered on social channels (hidden for article channels). */
export const SOCIAL_FORMATS: SocialFormatSpec[] = [
  { id: "static", label: "Static post (caption only)" },
  { id: "infographic", label: "Infographic (graphic spec + caption)" },
  { id: "carousel", label: "Carousel (slide-by-slide + caption)" },
];

export interface ChannelSpec {
  id: AgentChannel;
  label: string;
  format: OutputFormat;
  voiceKey:
    | "personal"
    | "company"
    | "meta"
    | "facebook"
    | "instagram"
    | "article"
    | "leadmagnet";
  /** Legacy channels stay resolvable (old runs render) but are hidden in the UI. */
  legacy?: boolean;
  /** Requires sourceReport in the brief step. */
  requiresSource: boolean;
  /** ContentItem type used when filing into the CMS (article formats only). */
  cmsType?: "BLOG" | "RESOURCE";
  /** Writer output budget override (long-form documents need more room). */
  maxOutputTokens?: number;
  /** Visual formats (social channels only) — second dropdown in the UI. */
  socialFormats?: SocialFormatSpec[];
  postTypes: { id: string; label: string }[];
}

export const CHANNELS: ChannelSpec[] = [
  {
    id: "LINKEDIN_PERSONAL",
    label: "LinkedIn — Zahir's profile",
    format: "caption",
    voiceKey: "personal",
    requiresSource: false,
    socialFormats: SOCIAL_FORMATS,
    postTypes: [
      { id: "research-insight", label: "Research insight / data story" },
      { id: "founder-story", label: "Founder story / behind the scenes" },
      { id: "industry-analysis", label: "Industry analysis / opinion" },
      { id: "launch-announcement", label: "Launch / product announcement" },
    ],
  },
  {
    id: "LINKEDIN_COMPANY",
    label: "LinkedIn — Clovion company page",
    format: "caption",
    voiceKey: "company",
    requiresSource: false,
    socialFormats: SOCIAL_FORMATS,
    postTypes: [
      { id: "research-insight", label: "Research insight / data story" },
      { id: "product-update", label: "Product update / feature" },
      { id: "educational", label: "Educational / how-to" },
      { id: "lead-magnet", label: "Lead magnet promotion" },
    ],
  },
  {
    id: "META_SOCIAL",
    label: "Facebook / Instagram (legacy)",
    format: "caption",
    voiceKey: "meta",
    requiresSource: false,
    legacy: true,
    socialFormats: SOCIAL_FORMATS,
    postTypes: [
      { id: "educational", label: "Educational / tip" },
      { id: "research-insight", label: "Research insight" },
      { id: "product-update", label: "Product update" },
      { id: "brand-story", label: "Brand story" },
    ],
  },
  {
    id: "FACEBOOK",
    label: "Facebook",
    format: "caption",
    voiceKey: "facebook",
    requiresSource: false,
    socialFormats: SOCIAL_FORMATS,
    postTypes: [
      { id: "educational", label: "Educational" },
      { id: "research-insight", label: "Research insight" },
      { id: "product-update", label: "Product update" },
      { id: "brand-story", label: "Brand story" },
    ],
  },
  {
    id: "INSTAGRAM",
    label: "Instagram",
    format: "caption",
    voiceKey: "instagram",
    requiresSource: false,
    socialFormats: SOCIAL_FORMATS,
    postTypes: [
      { id: "educational", label: "Educational" },
      { id: "research-insight", label: "Research insight" },
      { id: "product-update", label: "Product update" },
      { id: "brand-story", label: "Brand story" },
    ],
  },
  {
    id: "BLOG_ARTICLE",
    label: "Blog article",
    format: "article",
    voiceKey: "article",
    requiresSource: false,
    cmsType: "BLOG",
    postTypes: [
      { id: "educational-guide", label: "Educational guide" },
      { id: "research-analysis", label: "Research analysis" },
      { id: "opinion", label: "Opinion / position piece" },
      { id: "comparison", label: "Comparison / evaluation" },
      { id: "from-report", label: "From report (attach the report)" },
      { id: "course-outline", label: "Course outline (syllabus)" },
      { id: "course-lesson", label: "Course lesson" },
    ],
  },
  {
    id: "REPORT_ARTICLE",
    label: "Article from report (legacy)",
    format: "article",
    voiceKey: "article",
    requiresSource: true,
    legacy: true,
    cmsType: "BLOG",
    postTypes: [
      { id: "report-summary", label: "Report summary article" },
      { id: "report-deep-dive", label: "Deep dive on one finding" },
      { id: "report-takeaways", label: "Practical takeaways article" },
    ],
  },
  {
    id: "WEBSITE",
    label: "Website — lead magnet",
    format: "article",
    voiceKey: "leadmagnet",
    requiresSource: false,
    cmsType: "RESOURCE",
    maxOutputTokens: 16000,
    postTypes: [
      { id: "ultimate-guide", label: "Ultimate guide (chaptered)" },
      { id: "checklist", label: "Checklist / audit" },
      { id: "cheat-sheet", label: "Cheat sheet (rules at a glance)" },
      { id: "playbook", label: "Playbook / workbook" },
    ],
  },
];

export function channelSpec(id: AgentChannel): ChannelSpec {
  const spec = CHANNELS.find((c) => c.id === id);
  if (!spec) throw new Error(`Unknown channel: ${id}`);
  return spec;
}

export function isValidPostType(channel: AgentChannel, postType: string): boolean {
  return channelSpec(channel).postTypes.some((p) => p.id === postType);
}

export function isValidSocialFormat(
  channel: AgentChannel,
  format: string
): boolean {
  const spec = channelSpec(channel);
  return Boolean(spec.socialFormats?.some((f) => f.id === format));
}
