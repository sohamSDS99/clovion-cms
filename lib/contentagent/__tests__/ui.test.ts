import { describe, it, expect } from "vitest";
import {
  UI_CHANNELS,
  profilesFor,
  contentTypesFor,
  anglesFor,
  needsSourceReport,
  resolveSelection,
} from "@/lib/contentagent/ui";

describe("selection tree", () => {
  it("offers four channels", () => {
    expect(UI_CHANNELS.map((c) => c.id)).toEqual(["LINKEDIN", "FACEBOOK", "INSTAGRAM", "WEBSITE"]);
  });
  it("profile dropdown only exists for LinkedIn", () => {
    expect(profilesFor("LINKEDIN")).toHaveLength(2);
    expect(profilesFor("FACEBOOK")).toBeNull();
    expect(profilesFor("WEBSITE")).toBeNull();
  });
  it("content types differ between social and website", () => {
    expect(contentTypesFor("INSTAGRAM").map((t) => t.id)).toContain("carousel");
    expect(contentTypesFor("WEBSITE").map((t) => t.id)).toContain("lead-magnet");
  });
  it("courses have no angle dropdown", () => {
    expect(anglesFor("WEBSITE", null, "course-outline")).toBeNull();
    expect(anglesFor("WEBSITE", null, "blog-article")?.length).toBeGreaterThan(3);
  });
  it("blog angles exclude course post types", () => {
    const ids = (anglesFor("WEBSITE", null, "blog-article") ?? []).map((a) => a.id);
    expect(ids).not.toContain("course-outline");
    expect(ids).toContain("from-report");
  });
  it("source textarea only for from-report blog articles", () => {
    expect(needsSourceReport("WEBSITE", "blog-article", "from-report")).toBe(true);
    expect(needsSourceReport("WEBSITE", "blog-article", "opinion")).toBe(false);
    expect(needsSourceReport("LINKEDIN", "text-post", null)).toBe(false);
  });
  it("resolves LinkedIn profiles to the right channels", () => {
    expect(resolveSelection("LINKEDIN", "personal", "text-post", "founder-story")).toEqual({
      channel: "LINKEDIN_PERSONAL", format: "static", postType: "founder-story",
    });
    expect(resolveSelection("LINKEDIN", "company", "carousel", "educational").channel).toBe("LINKEDIN_COMPANY");
  });
  it("resolves website selections", () => {
    expect(resolveSelection("WEBSITE", null, "lead-magnet", "checklist")).toEqual({
      channel: "WEBSITE", postType: "checklist",
    });
    expect(resolveSelection("WEBSITE", null, "course-outline", null).postType).toBe("course-outline");
    expect(resolveSelection("WEBSITE", null, "blog-article", "from-report").channel).toBe("BLOG_ARTICLE");
  });
  it("resolves the new social channels", () => {
    expect(resolveSelection("FACEBOOK", null, "infographic", "educational")).toEqual({
      channel: "FACEBOOK", format: "infographic", postType: "educational",
    });
    expect(resolveSelection("INSTAGRAM", null, "carousel", "brand-story").channel).toBe("INSTAGRAM");
  });
});
