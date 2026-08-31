import { describe, expect, it } from "vitest";
import {
  CATEGORY_ORDER,
  type Category,
  type CategoryTokens,
  type ContextSnapshot,
  emptyCategoryTokens,
  emptyMessageKindTokens,
} from "../domain/context.ts";
import * as Fixture from "../fixtures/transcript.ts";
import { parseTranscript } from "../parser/parse-transcript.ts";
import { DEFAULT_CONTEXT_WINDOW } from "../parser/window.ts";
import {
  bandsFor,
  callIndexAtRatio,
  callX,
  CHART_HEIGHT,
  CHART_WIDTH,
  compactionIndices,
  playheadX,
} from "./scrubber.ts";

const snapshot = (
  index: number,
  byCategory: Partial<CategoryTokens>,
  reset = false,
): ContextSnapshot => {
  const totals = { ...emptyCategoryTokens(), ...byCategory };
  return {
    index,
    timestamp: undefined,
    model: undefined,
    measuredTotal: CATEGORY_ORDER.reduce((sum, category) => sum + totals[category], 0),
    byCategory: totals,
    byKind: emptyMessageKindTokens(),
    added: [],
    reset,
  };
};

/**
 * The y coordinates of one band's points, upper edge first.
 */
const yValues = (points: string): readonly number[] =>
  points.split(" ").map((point) => Number(point.split(",")[1]));

const bandFor = (
  bands: readonly { readonly category: Category; readonly points: string }[],
  category: Category,
): string => {
  const band = bands.find((candidate) => candidate.category === category);
  if (band === undefined) throw new Error(`no band for ${category}`);
  return band.points;
};

/**
 * A Session whose context grows, compacts, then grows again — the shape the
 * Scrubber exists to show.
 */
const compactedSession = () => {
  Fixture.resetFixtureSequence();
  const outcome = parseTranscript(
    "compacted.jsonl",
    Fixture.toJsonl([
      Fixture.skillListing(8_000),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 40_000 } }),
      Fixture.toolResult(120_000),
      Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 90_000 } }),
      Fixture.compactSummary(6_000),
      Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 45_000 } }),
      Fixture.userMessage(4_000),
      Fixture.assistantMessage({ id: "m4", usage: { cacheRead: 52_000 } }),
    ]),
  );
  if (!outcome.ok) throw new Error(`expected a Session, got: ${outcome.message}`);
  return outcome.session;
};

describe("callX", () => {
  it("spreads the API Calls evenly across the chart", () => {
    expect(callX(0, 5)).toBe(0);
    expect(callX(2, 5)).toBe(CHART_WIDTH / 2);
    expect(callX(4, 5)).toBe(CHART_WIDTH);
  });

  it("clamps an index outside the Session", () => {
    expect(callX(-3, 5)).toBe(0);
    expect(callX(99, 5)).toBe(CHART_WIDTH);
  });

  it("pins a single API Call to the left edge", () => {
    expect(callX(0, 1)).toBe(0);
  });
});

describe("playheadX", () => {
  it("keeps the rule inside the view box at both ends", () => {
    expect(playheadX(0, 5)).toBeGreaterThan(0);
    expect(playheadX(4, 5)).toBeLessThan(CHART_WIDTH);
    // Everything in between is exactly where the API Call sits.
    expect(playheadX(2, 5)).toBe(callX(2, 5));
  });
});

describe("callIndexAtRatio", () => {
  it("picks the nearest API Call to the pointer", () => {
    expect(callIndexAtRatio(0, 5)).toBe(0);
    expect(callIndexAtRatio(0.5, 5)).toBe(2);
    expect(callIndexAtRatio(1, 5)).toBe(4);
    // Round-trips: the call under the playhead is the call the pointer picks.
    expect(callIndexAtRatio(callX(3, 5) / CHART_WIDTH, 5)).toBe(3);
  });

  it("parks on an end rather than running off the chart", () => {
    expect(callIndexAtRatio(-2, 5)).toBe(0);
    expect(callIndexAtRatio(4, 5)).toBe(4);
  });

  it("has nowhere to go in a Session of one API Call", () => {
    expect(callIndexAtRatio(0.9, 1)).toBe(0);
    expect(callIndexAtRatio(0.9, 0)).toBe(0);
  });
});

describe("bandsFor", () => {
  it("draws one band per Category, stacked in legend order", () => {
    const bands = bandsFor([snapshot(0, { system: 10_000 }), snapshot(1, { system: 20_000 })], 100);

    expect(bands.map((band) => band.category)).toEqual([...CATEGORY_ORDER]);
  });

  it("stacks each Category on the ones below it", () => {
    const calls = [snapshot(0, { system: 50_000, messages: 50_000 })];
    const bands = bandsFor(calls, 200_000);

    // System occupies the bottom quarter of the chart, Messages the quarter
    // above it: the roof of one band is the floor of the next.
    const system = yValues(bandFor(bands, "system"));
    const messages = yValues(bandFor(bands, "messages"));
    expect(system).toContain(CHART_HEIGHT);
    expect(system[0]).toBe(CHART_HEIGHT * 0.75);
    // Messages sits on System's roof and reaches half height.
    expect(messages).toContain(CHART_HEIGHT * 0.75);
    expect(messages[0]).toBe(CHART_HEIGHT * 0.5);
  });

  it("reaches the top of the chart when the Context Window is full", () => {
    const bands = bandsFor([snapshot(0, { system: 200_000 })], 200_000);
    expect(yValues(bandFor(bands, "system"))[0]).toBe(0);
  });

  it("clamps a Context Snapshot larger than the Context Window to the top", () => {
    const bands = bandsFor([snapshot(0, { system: 400_000 })], 200_000);
    expect(yValues(bandFor(bands, "system"))[0]).toBe(0);
  });

  it("spans the chart for a Session of a single API Call", () => {
    const bands = bandsFor([snapshot(0, { system: 100_000 })], 200_000);
    const xs = bandFor(bands, "system")
      .split(" ")
      .map((point) => Number(point.split(",")[0]));

    // A single point would be an invisible, zero-width polygon.
    expect(new Set(xs)).toEqual(new Set([0, CHART_WIDTH]));
  });

  it("has nothing to draw for a Session with no API Calls", () => {
    expect(bandsFor([], 200_000)).toEqual([]);
  });

  it("drops at a compaction and climbs again afterwards", () => {
    const session = compactedSession();
    const bands = bandsFor(session.calls, DEFAULT_CONTEXT_WINDOW);
    const messages = yValues(bandFor(bands, "messages")).slice(0, session.calls.length);

    // y is measured from the top, so a bigger number is a smaller context: the
    // compacted call sits lower on the chart than the one before it.
    const [, before, compacted, after] = messages;
    if (before === undefined || compacted === undefined || after === undefined) {
      throw new Error("expected four API Calls on the chart");
    }
    expect(compacted).toBeGreaterThan(before);
    expect(after).toBeLessThan(compacted);
  });
});

describe("compactionIndices", () => {
  it("lists the API Calls that compacted, in transcript order", () => {
    const session = compactedSession();
    expect(compactionIndices(session.calls)).toEqual([2]);
    expect(session.calls[2]?.reset).toBe(true);
  });

  it("is empty for a Session that never compacted", () => {
    expect(compactionIndices([snapshot(0, { system: 10 }), snapshot(1, { system: 20 })])).toEqual(
      [],
    );
  });
});
