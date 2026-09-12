import { describe, expect, it } from "vitest";
import { nextPreviewIndex, previewStepDelay } from "./preview-scrub.ts";

describe("nextPreviewIndex", () => {
  it("steps to the next API Call", () => {
    expect(nextPreviewIndex(0, 5)).toBe(1);
    expect(nextPreviewIndex(3, 5)).toBe(4);
  });

  it("wraps to the first API Call past the end, so the preview never stops", () => {
    expect(nextPreviewIndex(4, 5)).toBe(0);
  });

  it("stays on the only API Call of a one-call Session", () => {
    expect(nextPreviewIndex(0, 1)).toBe(0);
  });

  // A Session with no API Calls never reaches the preview — `LandingPreview`
  // renders nothing without a Snapshot — but the wrap is a modulo, and a
  // modulo by zero is `NaN` rather than an error, which would reach the grid
  // as an index instead of failing.
  it("yields an index rather than NaN for an empty Session", () => {
    expect(nextPreviewIndex(0, 0)).toBe(0);
  });
});

describe("previewStepDelay", () => {
  it("holds the finished Session longer than a step, so the full grid lingers", () => {
    expect(previewStepDelay(4, 5)).toBeGreaterThan(previewStepDelay(0, 5));
  });

  it("uses the same step for every API Call before the last", () => {
    expect(previewStepDelay(1, 5)).toBe(previewStepDelay(3, 5));
  });

  it("is slower than the Scrubber's 260ms transport: this is scenery", () => {
    expect(previewStepDelay(0, 5)).toBeGreaterThan(260);
  });
});
