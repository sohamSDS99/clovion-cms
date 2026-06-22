/**
 * Unit tests for the canonical/absolute URL helpers (NFR-SEO-01).
 *
 * Manipulates PUBLIC_SITE_URL / PUBLIC_SITE_BASE_URL per-test and restores them.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  siteUrl,
  absoluteUrl,
  canonicalUrl,
  authorUrl,
  hasConfiguredSiteUrl,
  FALLBACK_SITE_URL,
} from "../canonical";

const ENV_KEYS = ["PUBLIC_SITE_URL", "PUBLIC_SITE_BASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("siteUrl", () => {
  it("falls back to the example origin when unset", () => {
    expect(siteUrl()).toBe(FALLBACK_SITE_URL);
    expect(hasConfiguredSiteUrl()).toBe(false);
  });

  it("prefers PUBLIC_SITE_URL and strips trailing slashes", () => {
    process.env.PUBLIC_SITE_URL = "https://clovion.ai/";
    expect(siteUrl()).toBe("https://clovion.ai");
    expect(hasConfiguredSiteUrl()).toBe(true);
  });

  it("falls back to PUBLIC_SITE_BASE_URL when PUBLIC_SITE_URL is unset", () => {
    process.env.PUBLIC_SITE_BASE_URL = "https://legacy.example.org///";
    expect(siteUrl()).toBe("https://legacy.example.org");
  });

  it("PUBLIC_SITE_URL takes precedence over PUBLIC_SITE_BASE_URL", () => {
    process.env.PUBLIC_SITE_URL = "https://primary.test";
    process.env.PUBLIC_SITE_BASE_URL = "https://secondary.test";
    expect(siteUrl()).toBe("https://primary.test");
  });
});

describe("absoluteUrl", () => {
  beforeEach(() => {
    process.env.PUBLIC_SITE_URL = "https://clovion.ai";
  });

  it("returns the origin for an empty path", () => {
    expect(absoluteUrl()).toBe("https://clovion.ai");
    expect(absoluteUrl("")).toBe("https://clovion.ai");
  });

  it("normalizes leading slashes", () => {
    expect(absoluteUrl("sitemap.xml")).toBe("https://clovion.ai/sitemap.xml");
    expect(absoluteUrl("/sitemap.xml")).toBe("https://clovion.ai/sitemap.xml");
    expect(absoluteUrl("///nested/path")).toBe("https://clovion.ai/nested/path");
  });
});

describe("canonicalUrl", () => {
  beforeEach(() => {
    process.env.PUBLIC_SITE_URL = "https://clovion.ai";
  });

  it("lowercases the content type and joins the slug", () => {
    expect(canonicalUrl("BLOG", "hello-world")).toBe("https://clovion.ai/blog/hello-world");
    expect(canonicalUrl("WEBINAR", "q1-launch")).toBe("https://clovion.ai/webinar/q1-launch");
  });
});

describe("authorUrl", () => {
  it("builds an /author/{slug} URL", () => {
    process.env.PUBLIC_SITE_URL = "https://clovion.ai";
    expect(authorUrl("jane")).toBe("https://clovion.ai/author/jane");
  });
});
