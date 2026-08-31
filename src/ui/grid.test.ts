import { describe, expect, it } from "vitest";
import type { Category, ContextItem, MessageKind } from "../domain/context.ts";
import * as Fixture from "../fixtures/transcript.ts";
import { parseTranscript } from "../parser/parse-transcript.ts";
import { DEFAULT_CONTEXT_WINDOW, LARGE_CONTEXT_WINDOW } from "../parser/window.ts";
import { buildCells, type Cell, CELL_TOKENS, type CellFill, cellCountFor } from "./grid.ts";

const item = (category: Category, tokens: number, kind?: MessageKind): ContextItem => ({
  category,
  kind,
  label: `${category} item`,
  tokens,
});

const fills = (cells: readonly Cell[]): readonly CellFill[] => cells.map((cell) => cell.fill);

const countOf = (cells: readonly Cell[], fill: CellFill): number =>
  cells.filter((cell) => cell.fill === fill).length;

/**
 * A Session whose second API Call adds Messages and whose third is a compaction,
 * so a test can step across both a plain call and a reset.
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
    ]),
  );
  if (!outcome.ok) throw new Error(`expected a Session, got: ${outcome.message}`);
  return outcome.session;
};

describe("cellCountFor", () => {
  it("draws a Cell per 1,000 tokens of the Context Window", () => {
    expect(CELL_TOKENS).toBe(1_000);
    expect(cellCountFor(DEFAULT_CONTEXT_WINDOW)).toBe(200);
    expect(cellCountFor(LARGE_CONTEXT_WINDOW)).toBe(1_000);
  });

  it("keeps one Cell for a window that makes no sense", () => {
    expect(cellCountFor(0)).toBe(1);
    expect(cellCountFor(-1)).toBe(1);
    expect(cellCountFor(Number.NaN)).toBe(1);
  });
});

describe("buildCells", () => {
  it("spans the whole Context Window, at the same Cell size for either window", () => {
    const items = [item("system", 20_000)];

    const small = buildCells(items, DEFAULT_CONTEXT_WINDOW);
    const large = buildCells(items, LARGE_CONTEXT_WINDOW);

    expect(small).toHaveLength(200);
    expect(large).toHaveLength(1_000);
    for (const cells of [small, large]) {
      for (const cell of cells) expect(cell.end - cell.start).toBe(CELL_TOKENS);
    }
    // The same Context Snapshot fills the same Cells either way; only the amount
    // of free space after it differs.
    expect(fills(large).slice(0, 200)).toEqual(fills(small));
  });

  it("leaves every Cell free for an empty Context Snapshot", () => {
    const cells = buildCells([], DEFAULT_CONTEXT_WINDOW);

    expect(countOf(cells, "free")).toBe(200);
    expect(cells.every((cell) => cell.items.length === 0)).toBe(true);
  });

  it("lays items out in the order they entered the context, not by Category", () => {
    const cells = buildCells(
      [
        item("system", 3_000),
        item("messages", 2_000, "user"),
        item("skills", 2_000),
        item("messages", 3_000, "assistant"),
      ],
      DEFAULT_CONTEXT_WINDOW,
    );

    expect(fills(cells).slice(0, 10)).toEqual([
      "system",
      "system",
      "system",
      "messages",
      "messages",
      "skills",
      "skills",
      "messages",
      "messages",
      "messages",
    ]);
  });

  it("reports the token range and the items filling each Cell", () => {
    const cells = buildCells([item("system", 1_500), item("skills", 500)], DEFAULT_CONTEXT_WINDOW);

    expect(cells[0]?.start).toBe(0);
    expect(cells[0]?.end).toBe(1_000);
    expect(cells[0]?.items.map((entry) => entry.category)).toEqual(["system"]);
    // Cell 1 holds the tail of System and all of Skills; the bigger share leads.
    expect(cells[1]?.items.map((entry) => entry.category)).toEqual(["system", "skills"]);
    expect(cells[199]?.end).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("colours a Cell by the Category holding the majority of its token range", () => {
    const cells = buildCells([item("system", 10_200), item("skills", 9_800)], 200_000);

    expect(cells[9]?.fill).toBe("system");
    // System keeps 200 tokens of Cell 10 and Skills takes the other 800.
    expect(cells[10]?.fill).toBe("skills");
  });

  it("never lets free space take a Cell a Category reaches into", () => {
    const cells = buildCells([item("mcp", 100)], DEFAULT_CONTEXT_WINDOW);

    expect(cells[0]?.fill).toBe("mcp");
    expect(countOf(cells, "free")).toBe(199);
  });

  it("gives a tied Cell to the Category that entered the context first", () => {
    const cells = buildCells(
      [item("system", 500), item("skills", 500), item("mcp", 500), item("memoryFiles", 500)],
      DEFAULT_CONTEXT_WINDOW,
    );

    // Each Cell is split evenly between two Categories; the earlier one wins.
    expect(cells[0]?.fill).toBe("system");
    expect(cells[1]?.fill).toBe("mcp");
  });

  it("leaves no free Cell when the Context Snapshot overflows the window", () => {
    const cells = buildCells(
      [item("system", 20_000), item("messages", 240_000, "toolResult")],
      DEFAULT_CONTEXT_WINDOW,
    );

    expect(cells).toHaveLength(200);
    expect(countOf(cells, "free")).toBe(0);
    expect(countOf(cells, "system")).toBe(20);
  });

  it("skips an item that was scaled down to no tokens at all", () => {
    const cells = buildCells(
      [item("system", 1_000), item("mcp", 0), item("skills", 1_000)],
      DEFAULT_CONTEXT_WINDOW,
    );

    expect(cells[1]?.fill).toBe("skills");
    expect(cells[1]?.items).toHaveLength(1);
  });

  describe("stepping through a Session", () => {
    it("only fills Cells at the frontier when the next API Call is not a compaction", () => {
      const session = compactedSession();
      const [first, second] = session.calls;
      if (first === undefined || second === undefined) throw new Error("expected two API Calls");
      expect(second.reset).toBe(false);

      const before = fills(buildCells(first.items, session.windowSize));
      const after = fills(buildCells(second.items, session.windowSize));

      const frontier = Math.floor(first.measuredTotal / CELL_TOKENS);
      expect(after.slice(0, frontier)).toEqual(before.slice(0, frontier));
      // The frontier itself moved: the call added context.
      expect(countOf(buildCells(second.items, session.windowSize), "free")).toBeLessThan(
        countOf(buildCells(first.items, session.windowSize), "free"),
      );
    });

    it("rewrites earlier Cells only when the API Call is a compaction", () => {
      const session = compactedSession();
      const [, second, third] = session.calls;
      if (second === undefined || third === undefined) throw new Error("expected three API Calls");
      expect(third.reset).toBe(true);

      const before = fills(buildCells(second.items, session.windowSize));
      const after = fills(buildCells(third.items, session.windowSize));

      const frontier = Math.floor(second.measuredTotal / CELL_TOKENS);
      expect(after.slice(0, frontier)).not.toEqual(before.slice(0, frontier));
    });
  });
});
