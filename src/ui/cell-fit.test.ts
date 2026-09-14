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

describe("fitCells", () => {
  it("fills the pane width and uses the largest clamped Cell that also fits its height", () => {
    const fit = fitCells(200, 1_360, 660);

    expect(blockWidth(fit)).toBeCloseTo(1_360);
    expect(blockHeight(200, fit)).toBeLessThanOrEqual(660);
    expect(fit.size).toBeGreaterThanOrEqual(MIN_CELL_PX);
    expect(fit.size).toBeLessThanOrEqual(MAX_CELL_PX);

    // One fewer column would make the Cell too large for the clamp.
    const fewerColumns = fit.columns - 1;
    const estimate = 1_360 / (fewerColumns + (fewerColumns - 1) * (3 / 16));
    const fewerGap = gapFor(estimate);
    const larger = (1_360 - (fewerColumns - 1) * fewerGap) / fewerColumns;
    expect(larger).toBeGreaterThan(MAX_CELL_PX);
  });

  it("keeps phone Cells tappable and scrolls vertically once the window cannot fit", () => {
    const phone = fitCells(1_000, 350, 560);

    // No whole column count puts this width inside the narrow 44–48px clamp,
    // so filling the width wins by less than one pixel at the lower edge.
    expect(phone.size).toBeCloseTo(MIN_CELL_PX - 6 / 7);
    expect(phone.size).toBeGreaterThanOrEqual(24);
    expect(blockWidth(phone)).toBeCloseTo(350);
    expect(blockHeight(1_000, phone)).toBeGreaterThan(560);
  });

  it("steps to smaller Cells when a larger Context Window needs another column", () => {
    const small = fitCells(300, 1_360, 660);
    const large = fitCells(325, 1_360, 660);

    expect(large.columns).toBeGreaterThan(small.columns);
    expect(large.size).toBeLessThan(small.size);
  });

  it("lets a short row exceed the nominal maximum rather than stretching empty tracks", () => {
    const fit = fitCells(20, 1_360, 660);

    expect(fit.columns).toBe(20);
    expect(fit.size).toBeGreaterThan(MAX_CELL_PX);
    expect(blockWidth(fit)).toBeCloseTo(1_360);
    expect(blockHeight(20, fit)).toBeLessThan(660);
  });

  it("uses a clamped Cell and lets a large Context Window scroll vertically", () => {
    const fit = fitCells(4_000, 600, 200);

    expect(fit.size).toBeGreaterThanOrEqual(MIN_CELL_PX);
    expect(fit.size).toBeLessThanOrEqual(MAX_CELL_PX);
    expect(blockWidth(fit)).toBeCloseTo(600);
    expect(blockHeight(4_000, fit)).toBeGreaterThan(200);
  });

  it("prefers the minimum column count when the pane can hold it", () => {
    const fit = fitCells(1_000, 400, 660);

    expect(fit.columns).toBe(MINIMUM_COLUMNS);
    expect(blockWidth(fit)).toBeCloseTo(400);
  });

  it("does not invent horizontal space when the pane is narrower than one Cell", () => {
    const fit = fitCells(1_000, 20, 660);

    expect(fit.columns).toBe(1);
    expect(fit.size).toBe(20);
    expect(blockWidth(fit)).toBe(20);
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

it("never paints smaller before measuring than the nominal floor", () => {
  expect(FALLBACK_CELL_PX).toBeGreaterThanOrEqual(MIN_CELL_PX);
});
