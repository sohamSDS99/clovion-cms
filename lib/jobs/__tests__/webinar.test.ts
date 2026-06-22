/**
 * Pure unit tests for the webinar auto-transition decision logic (§6.2 webinar
 * delta). No Redis / DB — only the pure `shouldFlip` predicate.
 */

import { describe, it, expect } from "vitest";
import { shouldFlip, type FlipCandidate } from "../webinar";

const NOW = new Date("2026-06-22T12:00:00.000Z");

/** Build a flip candidate with a fully-eligible default typeData. */
function mk(overrides: Partial<FlipCandidate["typeData"]> = {}): FlipCandidate {
  return {
    typeData: {
      endAt: "2026-06-22T11:00:00.000Z", // an hour before NOW
      isLive: true,
      recordingUrl: "https://cdn.example.com/rec.mp4",
      ...overrides,
    },
  };
}

describe("shouldFlip", () => {
  it("flips an eligible live, ended, recorded webinar when policy is ON", () => {
    expect(shouldFlip(mk(), NOW, true)).toBe(true);
  });

  it("never flips when the org policy is OFF", () => {
    expect(shouldFlip(mk(), NOW, false)).toBe(false);
  });

  it("does not flip when not currently live", () => {
    expect(shouldFlip(mk({ isLive: false }), NOW, true)).toBe(false);
    expect(shouldFlip(mk({ isLive: null }), NOW, true)).toBe(false);
    expect(shouldFlip(mk({ isLive: undefined }), NOW, true)).toBe(false);
  });

  it("does not flip without a non-empty recordingUrl", () => {
    expect(shouldFlip(mk({ recordingUrl: null }), NOW, true)).toBe(false);
    expect(shouldFlip(mk({ recordingUrl: "" }), NOW, true)).toBe(false);
    expect(shouldFlip(mk({ recordingUrl: "   " }), NOW, true)).toBe(false);
    expect(shouldFlip(mk({ recordingUrl: undefined }), NOW, true)).toBe(false);
  });

  it("does not flip before endAt has passed", () => {
    expect(
      shouldFlip(mk({ endAt: "2026-06-22T13:00:00.000Z" }), NOW, true)
    ).toBe(false);
  });

  it("does not flip exactly at endAt (strictly-before required)", () => {
    expect(
      shouldFlip(mk({ endAt: "2026-06-22T12:00:00.000Z" }), NOW, true)
    ).toBe(false);
  });

  it("requires a present, valid endAt", () => {
    expect(shouldFlip(mk({ endAt: null }), NOW, true)).toBe(false);
    expect(shouldFlip(mk({ endAt: undefined }), NOW, true)).toBe(false);
    expect(shouldFlip(mk({ endAt: "not-a-date" }), NOW, true)).toBe(false);
  });

  it("accepts an epoch-ms endAt", () => {
    const past = new Date("2026-06-22T11:00:00.000Z").getTime();
    expect(shouldFlip(mk({ endAt: past }), NOW, true)).toBe(true);
    const future = new Date("2026-06-22T13:00:00.000Z").getTime();
    expect(shouldFlip(mk({ endAt: future }), NOW, true)).toBe(false);
  });
});
