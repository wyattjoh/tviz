import { describe, expect, it } from "vitest";
import {
  type CellFit,
  FALLBACK_CELL_PX,
  FALLBACK_COLUMNS,
  fitCells,
  gapFor,
  MAX_CELL_PX,
  MIN_CELL_PX,
  MINIMUM_COLUMNS,
} from "./cell-fit.ts";

/**
 * The pixels the block occupies across, at the fit it was given.
 */
const blockWidth = ({ size, gap, columns }: CellFit): number =>
  columns * size + (columns - 1) * gap;

/**
 * The pixels the block occupies down, once `count` Cells have wrapped.
 */
const blockHeight = (count: number, { size, gap, columns }: CellFit): number => {
  const rows = Math.ceil(count / columns);
  return rows * size + (rows - 1) * gap;
};

/**
 * Whether `count` Cells of exactly this size fit the pane in *some*
 * arrangement — the question `fitCells` answers, asked by brute force so a test
 * can check the search found the best size rather than merely a working one.
 */
const fitsAt = (count: number, size: number, width: number, height: number): boolean => {
  const gap = gapFor(size);
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const across = columns * size + (columns - 1) * gap;
    const down = rows * size + (rows - 1) * gap;
    if (across <= width && down <= height) return true;
  }
  return false;
};

describe("fitCells", () => {
  it("grows Cells until the whole Context Window fills the pane", () => {
    const fit = fitCells(500, 1_360, 660);

    expect(blockWidth(fit)).toBeLessThanOrEqual(1_360);
    expect(blockHeight(500, fit)).toBeLessThanOrEqual(660);
    // The size is the largest that fits, not merely one that does: a Cell a
    // pixel bigger overflows the pane at every column count.
    expect(fitsAt(500, fit.size + 1, 1_360, 660)).toBe(false);
    // Solved rather than clamped at either end.
    expect(fit.size).toBeGreaterThan(MIN_CELL_PX);
    expect(fit.size).toBeLessThan(MAX_CELL_PX);
  });

  // A Cell is a button. Sizing purely to fit the pane always succeeds and
  // always produces something untappable — a 1M window in a phone-sized pane
  // solved to 12px — so past the floor the pane scrolls instead.
  it("keeps Cells tappable rather than fitting a big window into a small pane", () => {
    const phone = fitCells(1_000, 350, 560);

    expect(phone.size).toBe(MIN_CELL_PX);
    expect(phone.size).toBeGreaterThanOrEqual(24);
    expect(blockHeight(1_000, phone)).toBeGreaterThan(560);
  });

  it("draws a bigger Context Window with smaller Cells in the same pane", () => {
    const small = fitCells(400, 1_360, 660);
    const large = fitCells(1_200, 1_360, 660);

    expect(large.size).toBeLessThan(small.size);
  });

  it("stops growing at the maximum, rather than filling a pane with tiles", () => {
    const fit = fitCells(20, 1_360, 660);

    expect(fit.size).toBe(MAX_CELL_PX);
    expect(blockHeight(20, fit)).toBeLessThan(660);
  });

  it("stops shrinking at the minimum and lets the pane scroll instead", () => {
    const fit = fitCells(4_000, 600, 200);

    expect(fit.size).toBe(MIN_CELL_PX);
    expect(blockWidth(fit)).toBeLessThanOrEqual(600);
    expect(blockHeight(4_000, fit)).toBeGreaterThan(200);
  });

  it("fills the width even when the Cell size was clamped", () => {
    // At either end of the clamp the size stops following the pane, but the
    // columns never do: one more column always overflows the width.
    const grown = fitCells(20, 1_360, 660);
    expect(blockWidth(grown) + grown.size + grown.gap).toBeGreaterThan(1_360);

    const shrunk = fitCells(4_000, 600, 200);
    expect(blockWidth(shrunk) + shrunk.size + shrunk.gap).toBeGreaterThan(600);
  });

  it("keeps a floor under the column count, so a narrow pane scrolls sideways", () => {
    expect(fitCells(1_000, 20, 660).columns).toBe(MINIMUM_COLUMNS);
  });

  it("falls back to the fixed Cell before the pane has been measured", () => {
    const fallback = {
      size: FALLBACK_CELL_PX,
      gap: gapFor(FALLBACK_CELL_PX),
      columns: FALLBACK_COLUMNS,
    };

    expect(fitCells(1_000, 0, 0)).toEqual(fallback);
    expect(fitCells(1_000, Number.NaN, 660)).toEqual(fallback);
    expect(fitCells(1_000, 1_360, Number.POSITIVE_INFINITY)).toEqual(fallback);
    expect(fitCells(0, 1_360, 660)).toEqual(fallback);
  });
});

describe("gapFor", () => {
  it("scales the gap with the Cell, keeping the block's texture at any size", () => {
    expect(gapFor(16)).toBe(3);
    expect(gapFor(32)).toBe(6);
    expect(gapFor(MAX_CELL_PX)).toBe(9);
  });

  it("never closes the gap entirely, so Cells stay countable at the minimum", () => {
    expect(gapFor(MIN_CELL_PX)).toBeGreaterThanOrEqual(1);
    expect(gapFor(1)).toBeGreaterThanOrEqual(1);
  });
});

it("never paints smaller before measuring than after", () => {
  // The grid settles by growing into the pane, never by jumping up from a size
  // the clamp would not have allowed.
  expect(FALLBACK_CELL_PX).toBeGreaterThanOrEqual(MIN_CELL_PX);
});
