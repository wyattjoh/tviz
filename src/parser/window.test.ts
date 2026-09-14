import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_WINDOW,
  declaresLargeWindow,
  inferContextWindow,
  LARGE_CONTEXT_WINDOW,
} from "./window.ts";

describe("declaresLargeWindow", () => {
  it("reads the [1m] and [2m] opt-in markers, whatever their case", () => {
    expect(declaresLargeWindow("claude-sonnet-4-5[1m]")).toBe(true);
    expect(declaresLargeWindow("claude-opus-5[2m]")).toBe(true);
    expect(declaresLargeWindow("claude-opus-5[1M]")).toBe(true);
  });

  it("is false for a bare id, however capable the model is", () => {
    expect(declaresLargeWindow("claude-opus-5")).toBe(false);
    expect(declaresLargeWindow("claude-opus-4-8")).toBe(false);
    expect(declaresLargeWindow("claude-haiku-4-5")).toBe(false);
  });

  it("is false when the marker is not at the end", () => {
    expect(declaresLargeWindow("claude-opus-5[1m]-preview")).toBe(false);
  });
});

describe("inferContextWindow", () => {
  // The whole point of ADR-0009: the id says what the model can do, the
  // Session says what it did. Claude Code's 1M window is opt-in, so a
  // 1M-capable model is not evidence that this Session had 1M.
  it("does not read a 1M-capable model id as a 1M Session", () => {
    expect(inferContextWindow("claude-opus-4-8", 104_589)).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(inferContextWindow("claude-opus-5", 45_321)).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(inferContextWindow("claude-sonnet-5", 0)).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("takes a total past the default as proof of the larger window", () => {
    expect(inferContextWindow("claude-opus-5", 501_607)).toBe(LARGE_CONTEXT_WINDOW);
    // No model id at all: the peak alone still proves it.
    expect(inferContextWindow(undefined, 200_001)).toBe(LARGE_CONTEXT_WINDOW);
  });

  it("is not fooled by a peak that merely reaches the default", () => {
    expect(inferContextWindow(undefined, DEFAULT_CONTEXT_WINDOW)).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("honours the opt-in marker even when the Session stayed small", () => {
    expect(inferContextWindow("claude-sonnet-4-5[1m]", 12_000)).toBe(LARGE_CONTEXT_WINDOW);
  });

  it("falls to the smaller claim when the transcript recorded no model", () => {
    expect(inferContextWindow(undefined, 45_321)).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});
