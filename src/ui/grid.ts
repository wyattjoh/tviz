/**
 * Lays a Context Snapshot out as a fixed grid of Cells, the way `/context`
 * draws it.
 */
import { type Category, CATEGORY_ORDER, type CategoryTokens } from "../domain/context.ts";

/**
 * Number of Cells in the grid: 20 columns × 10 rows.
 */
export const CELL_COUNT = 200;

/**
 * Columns per grid row.
 */
export const CELL_COLUMNS = 20;

/**
 * What fills a Cell: a Category, or nothing yet.
 */
export type CellFill = Category | "free";

/**
 * The tokens one Cell stands for.
 */
export const cellQuantum = (windowSize: number, cellCount: number = CELL_COUNT): number =>
  windowSize / cellCount;

/**
 * The token range a Cell covers, as `[start, end)`.
 */
export const cellTokenRange = (
  index: number,
  windowSize: number,
  cellCount: number = CELL_COUNT,
): readonly [number, number] => {
  const quantum = cellQuantum(windowSize, cellCount);
  return [Math.round(index * quantum), Math.round((index + 1) * quantum)];
};

/**
 * Assigns every Cell the Category that fills the majority of its token range.
 *
 * Categories are laid out end to end in {@link CATEGORY_ORDER}; whatever is left
 * over at the end of the window is free space. A Category wins a tie against
 * free space so a small Category is never invisible.
 */
export const buildCells = (
  byCategory: CategoryTokens,
  windowSize: number,
  cellCount: number = CELL_COUNT,
): readonly CellFill[] => {
  const quantum = cellQuantum(windowSize, cellCount);
  const segments: { category: Category; start: number; end: number }[] = [];
  let filled = 0;
  for (const category of CATEGORY_ORDER) {
    const tokens = Math.max(0, byCategory[category]);
    segments.push({ category, start: filled, end: filled + tokens });
    filled += tokens;
  }

  return Array.from({ length: cellCount }, (_, index): CellFill => {
    const cellStart = index * quantum;
    const cellEnd = cellStart + quantum;

    let winner: Category | undefined;
    let winningOverlap = 0;
    for (const segment of segments) {
      const overlap = Math.min(segment.end, cellEnd) - Math.max(segment.start, cellStart);
      if (overlap > winningOverlap) {
        winningOverlap = overlap;
        winner = segment.category;
      }
    }

    const freeOverlap = Math.max(0, cellEnd - Math.max(cellStart, filled));
    return winner !== undefined && winningOverlap >= freeOverlap ? winner : "free";
  });
};
