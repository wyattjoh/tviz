import { describe, expect, it } from "vitest";
import {
  type ContextItem,
  type ContextSnapshot,
  cumulativeItems,
  emptyCategoryTokens,
  emptyMessageKindTokens,
} from "./context.ts";

const item = (label: string, tokens: number): ContextItem => ({
  category: "messages",
  kind: "user",
  label,
  tokens,
});

const call = (index: number, added: readonly ContextItem[], reset = false): ContextSnapshot => ({
  index,
  timestamp: undefined,
  model: undefined,
  measuredTotal: added.reduce((sum, entry) => sum + entry.tokens, 0),
  byCategory: emptyCategoryTokens(),
  byKind: emptyMessageKindTokens(),
  added,
  reset,
});

const labelsOf = (calls: readonly ContextSnapshot[], index: number): readonly string[] =>
  cumulativeItems(calls, index).map((entry) => entry.label);

describe("cumulativeItems", () => {
  it("concatenates the items every API Call added, oldest first", () => {
    const calls = [
      call(0, [item("a", 100), item("b", 200)]),
      call(1, [item("c", 300)]),
      call(2, [item("d", 400)]),
    ];

    expect(labelsOf(calls, 0)).toEqual(["a", "b"]);
    expect(labelsOf(calls, 1)).toEqual(["a", "b", "c"]);
    expect(labelsOf(calls, 2)).toEqual(["a", "b", "c", "d"]);
  });

  it("makes each API Call's items a prefix of the next, so the grid only grows", () => {
    const calls = [call(0, [item("a", 100)]), call(1, [item("b", 200)]), call(2, [item("c", 300)])];

    for (let index = 1; index < calls.length; index += 1) {
      const previous = cumulativeItems(calls, index - 1);
      expect(cumulativeItems(calls, index).slice(0, previous.length)).toEqual(previous);
    }
  });

  describe("across a compaction", () => {
    // Call 2 compacted: everything before it left the window, and call 3
    // appended to what the compaction left behind.
    const calls = [
      call(0, [item("before-1", 100)]),
      call(1, [item("before-2", 200)]),
      call(2, [item("summary", 300)], true),
      call(3, [item("after", 400)]),
    ];

    it("starts again at the compaction rather than carrying the old items", () => {
      expect(labelsOf(calls, 1)).toEqual(["before-1", "before-2"]);
      expect(labelsOf(calls, 2)).toEqual(["summary"]);
    });

    it("carries the compacted items forward into the calls after it", () => {
      expect(labelsOf(calls, 3)).toEqual(["summary", "after"]);
    });

    it("keeps reading from the *latest* compaction when a Session has two", () => {
      const twice = [
        ...calls,
        call(4, [item("summary-2", 500)], true),
        call(5, [item("after-2", 600)]),
      ];

      expect(labelsOf(twice, 5)).toEqual(["summary-2", "after-2"]);
    });

    it("treats a first API Call marked as a reset as the start of the window", () => {
      const fromReset = [call(0, [item("a", 100)], true), call(1, [item("b", 200)])];
      expect(labelsOf(fromReset, 1)).toEqual(["a", "b"]);
    });
  });

  it("leaves out items that scaled down to no tokens, which cover no Cell", () => {
    const calls = [call(0, [item("a", 100), item("nothing", 0), item("b", 200)])];
    expect(labelsOf(calls, 0)).toEqual(["a", "b"]);
  });

  it("describes no items for an API Call that is not in the Session", () => {
    const calls = [call(0, [item("a", 100)])];
    expect(cumulativeItems(calls, -1)).toEqual([]);
    expect(cumulativeItems(calls, 1)).toEqual([]);
    expect(cumulativeItems([], 0)).toEqual([]);
  });
});
