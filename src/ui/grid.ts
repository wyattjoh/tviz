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
 * One fill competing for Cells: its exact share of the grid and the number of
 * Cells it must not drop below.
 */
type Share = {
  readonly fill: CellFill;
  readonly exact: number;
  readonly minimum: number;
};

/**
 * Splits `cellCount` Cells between the shares by the largest-remainder method,
 * never going below a share's `minimum` while any share is still above its own.
 */
const apportion = (shares: readonly Share[], cellCount: number): number[] => {
  const counts = shares.map((share) => Math.max(share.minimum, Math.floor(share.exact)));
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share.exact - Math.floor(share.exact) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const total = (): number => counts.reduce((sum, count) => sum + count, 0);

  for (const { index } of byRemainder) {
    if (total() >= cellCount) break;
    counts[index] = (counts[index] ?? 0) + 1;
  }

  // A share bumped up to its minimum, or a Context Snapshot that overflows the
  // Context Window, can push the total past the grid; give the surplus back
  // starting with the smallest remainder.
  for (const { index } of [...byRemainder].reverse()) {
    const count = counts[index] ?? 0;
    const surplus = total() - cellCount;
    if (surplus <= 0) break;
    const minimum = shares[index]?.minimum ?? 0;
    counts[index] = Math.max(minimum, count - surplus);
  }

  return counts;
};

/**
 * Assigns every Cell in the grid a fill.
 *
 * Categories are laid out end to end in {@link CATEGORY_ORDER} and whatever is
 * left of the Context Window is free space. Cells are split by the
 * largest-remainder method so the grid always holds exactly `cellCount` Cells,
 * and every Category with a non-zero total keeps at least one Cell — a Category
 * the legend lists is never missing from the grid, however small it is.
 */
export const buildCells = (
  byCategory: CategoryTokens,
  windowSize: number,
  cellCount: number = CELL_COUNT,
): readonly CellFill[] => {
  const quantum = cellQuantum(windowSize, cellCount);
  if (!Number.isFinite(quantum) || quantum <= 0) {
    return Array.from({ length: cellCount }, (): CellFill => "free");
  }

  const categoryShares = CATEGORY_ORDER.map((category): Share => {
    const tokens = Math.max(0, byCategory[category]);
    return { fill: category, exact: tokens / quantum, minimum: tokens > 0 ? 1 : 0 };
  });
  const used = categoryShares.reduce((sum, share) => sum + share.exact, 0);
  const shares: readonly Share[] = [
    ...categoryShares,
    { fill: "free", exact: Math.max(0, cellCount - used), minimum: 0 },
  ];

  const counts = apportion(shares, cellCount);
  return shares.flatMap((share, index) =>
    Array.from({ length: counts[index] ?? 0 }, (): CellFill => share.fill),
  );
};
