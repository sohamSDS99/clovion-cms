import { describe, expect, it } from "vitest";
import {
  slugFromTitle,
  statusBadge,
  metaTitleStatus,
  metaDescriptionStatus,
  contentTypeLabel,
  formatBytes,
  relativeTime,
  localInputToIso,
  isoToLocalInput,
} from "@/lib/ui/format";

describe("slugFromTitle", () => {
  it("kebab-cases and lowercases", () => {
    expect(slugFromTitle("Hello World")).toBe("hello-world");
  });
  it("strips diacritics and symbols, collapses repeats", () => {
    expect(slugFromTitle("Café   crème!!! — 2024")).toBe("cafe-creme-2024");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugFromTitle("  --Edge-- ")).toBe("edge");
  });
  it("returns empty string for symbol-only input", () => {
    expect(slugFromTitle("@#$%")).toBe("");
  });
});

describe("statusBadge", () => {
  it("maps each status to a tone + label", () => {
    expect(statusBadge("DRAFT")).toEqual({ tone: "draft", label: "Draft" });
    expect(statusBadge("IN_REVIEW")).toEqual({ tone: "review", label: "In review" });
    expect(statusBadge("PUBLISHED")).toEqual({ tone: "published", label: "Published" });
    expect(statusBadge("SCHEDULED").tone).toBe("scheduled");
    expect(statusBadge("UNPUBLISHED").tone).toBe("unpublished");
    expect(statusBadge("ARCHIVED").tone).toBe("archived");
  });
});

describe("contentTypeLabel", () => {
  it("humanizes type enums", () => {
    expect(contentTypeLabel("BLOG")).toBe("Blog");
    expect(contentTypeLabel("FAQ")).toBe("FAQ");
    expect(contentTypeLabel("WEBINAR")).toBe("Webinar");
  });
});

describe("metaTitleStatus", () => {
  it("flags empty", () => {
    expect(metaTitleStatus("")).toEqual({ count: 0, state: "empty" });
  });
  it("ok at or below 60", () => {
    expect(metaTitleStatus("a".repeat(60)).state).toBe("ok");
  });
  it("warns above 60", () => {
    const r = metaTitleStatus("a".repeat(61));
    expect(r.count).toBe(61);
    expect(r.state).toBe("warn");
  });
});

describe("metaDescriptionStatus", () => {
  it("warns under 50", () => {
    expect(metaDescriptionStatus("a".repeat(49)).state).toBe("warn");
  });
  it("ok within 50-160", () => {
    expect(metaDescriptionStatus("a".repeat(100)).state).toBe("ok");
  });
  it("warns over 160", () => {
    expect(metaDescriptionStatus("a".repeat(161)).state).toBe("warn");
  });
});

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-06-22T12:00:00Z").getTime();
  it("recent -> just now", () => {
    expect(relativeTime("2026-06-22T11:59:40Z", now)).toBe("just now");
  });
  it("minutes/hours/days", () => {
    expect(relativeTime("2026-06-22T11:30:00Z", now)).toBe("30m ago");
    expect(relativeTime("2026-06-22T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-06-20T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("datetime-local round trip", () => {
  it("localInputToIso returns valid ISO", () => {
    const iso = localInputToIso("2030-01-01T10:30");
    expect(iso).toBeTruthy();
    expect(new Date(iso as string).getMinutes()).toBe(30);
  });
  it("invalid input -> null", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("not-a-date")).toBeNull();
  });
  it("isoToLocalInput formats to minute precision", () => {
    const local = isoToLocalInput("2030-01-01T10:30:00.000Z");
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
