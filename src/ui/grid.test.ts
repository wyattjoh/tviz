import { describe, expect, it } from "vitest";
import {
  type Category,
  type ContextItem,
  cumulativeItems,
  type MessageKind,
} from "../domain/context.ts";
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

  it("gives a Category smaller than a Cell one Cell of its own", () => {
    const cells = buildCells(
      [item("system", 20_000), item("mcp", 175), item("messages", 5_000, "toolResult")],
      DEFAULT_CONTEXT_WINDOW,
    );

    // MCP holds 175 of Cell 20's 1,000 tokens and would lose every majority
    // vote, leaving a Category the legend lists with nothing on the grid.
    expect(countOf(cells, "mcp")).toBe(1);
    const floored = cells.find((cell) => cell.fill === "mcp");
    // The Cell it took is one it actually reaches into, and it is still the Cell
    // sitting at its own token offset: only the colour changed.
    expect(floored?.items.map((entry) => entry.category)).toContain("mcp");
    expect(floored?.start).toBe(20_000);
    expect(cells.map((cell) => cell.start)).toEqual(cells.map((cell) => cell.index * CELL_TOKENS));
    // Nothing was starved to pay for it.
    expect(countOf(cells, "system")).toBe(20);
    expect(countOf(cells, "messages")).toBe(5);
  });

  it("never takes the only Cell another Category holds", () => {
    // Three Categories smaller than a Cell inside two Cells: the grid cannot
    // show them all, and shuffling one colour onto another's only Cell would
    // just move the problem. The legend still carries every total.
    const cells = buildCells(
      [item("system", 900), item("skills", 600), item("mcp", 500)],
      DEFAULT_CONTEXT_WINDOW,
    );

    // Cell 1 is split evenly between Skills and MCP, so Skills takes it as the
    // earlier arrival and MCP — the only Category left without a Cell — has no
    // donor holding a second one.
    expect(fills(cells).slice(0, 2)).toEqual(["system", "skills"]);
    expect(countOf(cells, "mcp")).toBe(0);
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

      const before = fills(buildCells(cumulativeItems(session.calls, 0), session.windowSize));
      const after = fills(buildCells(cumulativeItems(session.calls, 1), session.windowSize));

      // Everything the first call fully covered is untouched. Its last Cell is
      // only partly covered, so it belongs to the frontier the second call
      // advances — see "recolours only the partly-filled frontier Cell".
      const frontier = Math.floor(first.measuredTotal / CELL_TOKENS);
      expect(after.slice(0, frontier)).toEqual(before.slice(0, frontier));
      expect(
        countOf(buildCells(cumulativeItems(session.calls, 1), session.windowSize), "free"),
      ).toBeLessThan(
        countOf(buildCells(cumulativeItems(session.calls, 0), session.windowSize), "free"),
      );
    });

    it("recolours only the partly-filled frontier Cell as the context grows", () => {
      const before = buildCells([item("system", 1_300)], DEFAULT_CONTEXT_WINDOW);
      // 300 tokens of System sit in Cell 1; the next call fills the other 700.
      const after = buildCells(
        [item("system", 1_300), item("messages", 700, "user")],
        DEFAULT_CONTEXT_WINDOW,
      );

      expect(before[0]?.fill).toBe("system");
      expect(before[1]?.fill).toBe("system");
      // The fully covered Cell keeps its colour; the frontier Cell changes hands
      // because the majority of its range changed hands. No Cell moved.
      expect(after[0]?.fill).toBe("system");
      expect(after[1]?.fill).toBe("messages");
      expect(after[1]?.start).toBe(before[1]?.start);
    });

    it("keeps a Cell the floor granted once the Category wins Cells of its own", () => {
      // MCP arrives 175 tokens at a time and is invisible on the grid until the
      // floor gives it Cell 20. Twelve calls later it has grown past the
      // quantum and wins Cells outright — which must not cost it the Cell it
      // was granted: Cell 20 is settled far behind the frontier, and ADR-0006
      // lets only the frontier Cell change colour.
      const before = buildCells(
        [item("system", 20_000), item("mcp", 175), item("messages", 5_000, "toolResult")],
        DEFAULT_CONTEXT_WINDOW,
      );
      const after = buildCells(
        [
          item("system", 20_000),
          item("mcp", 175),
          item("messages", 5_000, "toolResult"),
          item("mcp", 12_000),
        ],
        DEFAULT_CONTEXT_WINDOW,
      );

      expect(before[20]?.fill).toBe("mcp");
      expect(after[20]?.fill).toBe("mcp");
      // Everything the earlier Context Snapshot fully covered is untouched.
      expect(fills(after).slice(0, 25)).toEqual(fills(before).slice(0, 25));
      // MCP now also holds the thirteen Cells its own tokens fill, on top of
      // the one the floor granted it.
      expect(countOf(after, "mcp")).toBe(14);
    });

    it("rewrites earlier Cells only when the API Call is a compaction", () => {
      const session = compactedSession();
      const [, second, third] = session.calls;
      if (second === undefined || third === undefined) throw new Error("expected three API Calls");
      expect(third.reset).toBe(true);

      const before = fills(buildCells(cumulativeItems(session.calls, 1), session.windowSize));
      const after = fills(buildCells(cumulativeItems(session.calls, 2), session.windowSize));

      const frontier = Math.floor(second.measuredTotal / CELL_TOKENS);
      expect(after.slice(0, frontier)).not.toEqual(before.slice(0, frontier));
    });
  });
});
