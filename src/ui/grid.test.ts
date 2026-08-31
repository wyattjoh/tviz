import { describe, expect, it } from "vitest";
import { type Category, emptyCategoryTokens } from "../domain/context.ts";
import { buildCells, CELL_COUNT, cellTokenRange } from "./grid.ts";

const countOf = (cells: readonly (Category | "free")[], fill: Category | "free"): number =>
  cells.filter((cell) => cell === fill).length;

describe("buildCells", () => {
  it("leaves every Cell free for an empty Context Snapshot", () => {
    const cells = buildCells(emptyCategoryTokens(), 200_000);
    expect(cells).toHaveLength(CELL_COUNT);
    expect(countOf(cells, "free")).toBe(CELL_COUNT);
  });

  it("fills Cells in proportion to each Category's share of the window", () => {
    const tokens = emptyCategoryTokens();
    tokens.system = 50_000;
    tokens.messages = 50_000;

    const cells = buildCells(tokens, 200_000);
    expect(countOf(cells, "system")).toBe(50);
    expect(countOf(cells, "messages")).toBe(50);
    expect(countOf(cells, "free")).toBe(100);
  });

  it("lays Categories out in /context order", () => {
    const tokens = emptyCategoryTokens();
    tokens.system = 100_000;
    tokens.skills = 100_000;

    const cells = buildCells(tokens, 200_000);
    expect(cells[0]).toBe("system");
    expect(cells.at(-1)).toBe("skills");
  });

  it("colours a Cell by the Category holding the majority of its range", () => {
    const tokens = emptyCategoryTokens();
    // System stops mid-Cell; Skills holds the larger part of Cell 10.
    tokens.system = 10_200;
    tokens.skills = 9_800;

    const cells = buildCells(tokens, 200_000);
    expect(cells[9]).toBe("system");
    expect(cells[10]).toBe("skills");
    expect(countOf(cells, "free")).toBe(180);
  });

  it("reports the token range a Cell stands for", () => {
    expect(cellTokenRange(0, 200_000)).toEqual([0, 1_000]);
    expect(cellTokenRange(199, 200_000)).toEqual([199_000, 200_000]);
  });
});
