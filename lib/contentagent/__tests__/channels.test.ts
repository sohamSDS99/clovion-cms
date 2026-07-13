import { describe, it, expect } from "vitest";
import { CHANNELS, channelSpec, isValidPostType, isValidSocialFormat, SOCIAL_FORMATS } from "@/lib/contentagent/channels";
import { createRunSchema } from "@/lib/contentagent/schemas";

describe("channel registry", () => {
  it("covers all channels (incl. legacy) with at least one post type", () => {
    expect(CHANNELS).toHaveLength(8);
    expect(CHANNELS.filter((c) => c.legacy)).toHaveLength(2);
    for (const c of CHANNELS) expect(c.postTypes.length).toBeGreaterThan(0);
  });
  it("only report articles require source material", () => {
    expect(channelSpec("REPORT_ARTICLE").requiresSource).toBe(true);
    expect(CHANNELS.filter((c) => c.requiresSource)).toHaveLength(1);
  });
  it("website lead magnets file into Resources with a bigger output budget", () => {
    const site = channelSpec("WEBSITE");
    expect(site.cmsType).toBe("RESOURCE");
    expect(site.format).toBe("article");
    expect(site.maxOutputTokens).toBeGreaterThanOrEqual(12000);
    expect(isValidPostType("WEBSITE", "ultimate-guide")).toBe(true);
  });
  it("social channels offer visual formats; article channels don't", () => {
    expect(channelSpec("LINKEDIN_PERSONAL").socialFormats).toEqual(SOCIAL_FORMATS);
    expect(channelSpec("META_SOCIAL").socialFormats).toEqual(SOCIAL_FORMATS);
    expect(channelSpec("BLOG_ARTICLE").socialFormats).toBeUndefined();
    expect(channelSpec("WEBSITE").socialFormats).toBeUndefined();
    expect(isValidSocialFormat("LINKEDIN_COMPANY", "infographic")).toBe(true);
    expect(isValidSocialFormat("LINKEDIN_COMPANY", "carousel")).toBe(true);
    expect(isValidSocialFormat("LINKEDIN_COMPANY", "nonsense")).toBe(false);
    expect(isValidSocialFormat("BLOG_ARTICLE", "infographic")).toBe(false);
  });
  it("validates post types per channel", () => {
    expect(isValidPostType("LINKEDIN_PERSONAL", "founder-story")).toBe(true);
    expect(isValidPostType("LINKEDIN_PERSONAL", "report-summary")).toBe(false);
  });
});

describe("createRunSchema", () => {
  it("accepts a valid run request", () => {
    const r = createRunSchema.safeParse({
      channel: "LINKEDIN_PERSONAL",
      postType: "research-insight",
      brief: "Write about the funnel study drop-off finding.",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a too-short brief and unknown fields", () => {
    expect(createRunSchema.safeParse({ channel: "META_SOCIAL", postType: "educational", brief: "short" }).success).toBe(false);
    expect(createRunSchema.safeParse({ channel: "META_SOCIAL", postType: "educational", brief: "long enough brief", autoPublish: true }).success).toBe(false);
  });
});
