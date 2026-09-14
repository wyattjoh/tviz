/**
 * How large a Cell is drawn.
 *
 * A Cell is always {@link CELL_TOKENS} tokens, but its *physical* size follows
 * the column count that makes the block span the pane exactly (ADR-0006). The
 * preferred count keeps Cells inside a nominal size clamp, then adds columns
 * when doing so buys back enough height. A larger Context Window can therefore
 * draw smaller Cells in the same pane while every row still fills its width.
 *
 * The clamp keeps normal cases tappable without turning a small Context Window
 * into a wall of tiles. It is nominal because integer column counts leave
 * widths no count can serve: there the nearest size wins, and a short final row
 * may exceed the maximum rather than inventing empty tracks. A block that is
 * still too tall scrolls vertically instead of shrinking to fit its height.
 *
 * The geometry lives here rather than in the component so the shape of the
 * block is testable without a DOM, the way the Scrubber's chart is.
 */

/**
 * Nominal smallest Cell. Past this the pane scrolls rather than shrinking the
 * whole Context Window to fit; an unserviceable pane width may miss slightly.
 *
 * This is a **tap target** before it is a visual floor. A Cell is a button, and
 * the size that fits a whole Context Window into a phone-sized pane is far
 * below the 24px WCAG 2.5.8 asks of one — a 1M window in a 350x560 pane solved
 * to 12px. Sized from the pane alone the grid always fits on screen and is
 * always untappable; the honest trade is a comfortable Cell and a pane that
 * scrolls, which is what this floor now buys.
 *
 * At 32 it binds on a phone at both window sizes (roughly 1.6x scroll at 200k)
 * and on desktop only for a 1M Session, which since ADR-0009 means one that
 * actually exceeded 200k.
 */
export const MIN_CELL_PX = 44;

/**
 * Nominal largest Cell. A final row with fewer Cells than available tracks may
 * exceed it so those Cells still span the pane without empty tracks.
 */
export const MAX_CELL_PX = 48;

/**
 * Gap between Cells, as a fraction of the Cell. Scaling the gap with the Cell
 * keeps the texture of the block the same at any size; the ratio is the 16px
 * Cell and 3px gap the grid was drawn at when Cells had one fixed size.
 */
export const CELL_GAP_RATIO = 3 / 16;

/**
 * Cell size used before the pane has been measured — the first paint, and any
 * environment without `ResizeObserver` (jsdom).
 *
 * Kept at {@link MIN_CELL_PX} so the first paint starts from the nominal floor.
 */
export const FALLBACK_CELL_PX = MIN_CELL_PX;

/**
 * Columns drawn before the pane has been measured.
 */
export const FALLBACK_COLUMNS = 20;

/**
 * Preferred minimum column count when the pane is wide enough to hold it.
 * Narrower panes use fewer columns rather than introducing horizontal scroll.
 */
export const MINIMUM_COLUMNS = 8;

/**
 * The physical geometry of one grid block: how big each Cell is, how far apart
 * they sit, and how many fit across the pane.
 */
export type CellFit = {
  /**
   * Width and height of a Cell, in pixels.
   */
  readonly size: number;
  /**
   * Gap between Cells, in pixels. At least 1, so Cells never merge visually.
   */
  readonly gap: number;
  /**
   * Columns to draw. Always follows the pane's width at {@link size}, so the
   * block fills the width even when the size was clamped.
   */
  readonly columns: number;
};

/**
 * The gap that goes with a Cell of this size.
 *
 * Floored rather than rounded so the gap can never push a block that was solved
 * to fit back over the edge of the pane.
 */
export const gapFor = (size: number): number => Math.max(1, Math.floor(size * CELL_GAP_RATIO));

/**
 * The block drawn before the pane has been measured.
 */
const FALLBACK: CellFit = {
  size: FALLBACK_CELL_PX,
  gap: gapFor(FALLBACK_CELL_PX),
  columns: FALLBACK_COLUMNS,
};

/**
 * Fits `count` Cells into a pane of `width` × `height` pixels.
 *
 * Solves for the **column count**, not for the Cell: a count divides the pane's
 * width exactly, so the block always spans it. Picking a whole-pixel Cell first
 * and deriving columns from it — which this did before — left whatever did not
 * divide evenly as dead space at the edge, up to most of a Cell wide.
 *
 * The Cell size is then whatever that count implies, and the clamp decides
 * which counts are allowed: too few columns and the Cell is over
 * {@link MAX_CELL_PX}, too many and it is under {@link MIN_CELL_PX}. So the
 * grid *scales* as the pane changes and *steps* a column in or out at the
 * moment the Cell would leave the range — which is the breakpoint, derived
 * rather than declared.
 *
 * Among the counts that qualify it takes the fewest — the largest Cell — unless
 * that block is taller than the pane, in which case it adds columns while they
 * still qualify, since more columns is fewer rows is less scrolling.
 */
export const fitCells = (count: number, width: number, height: number): CellFit => {
  const min = MIN_CELL_PX;
  const max = MAX_CELL_PX;
  const ratio = CELL_GAP_RATIO;
  const minCols = MINIMUM_COLUMNS;

  /**
   * The Cell that `columns` columns implies, filling the width exactly.
   *
   * The gap is a fraction of the Cell and the Cell depends on the gap, so this
   * estimates once to size the gap, then solves the Cell against that whole
   * number of pixels.
   */
  const solve = (columns: number): CellFit => {
    const estimate = width / (columns + (columns - 1) * ratio);
    const gap = Math.max(1, Math.floor(estimate * ratio));
    const size = (width - (columns - 1) * gap) / columns;
    return { size, gap, columns };
  };
  const tallerThanPane = (fit: CellFit): boolean => {
    const rows = Math.ceil(count / fit.columns);
    return rows * fit.size + (rows - 1) * fit.gap > height;
  };
  if (count <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return FALLBACK;
  if (width <= 0 || height <= 0) return FALLBACK;

  // Never more columns than there are Cells: a 5-Cell Session should not be
  // drawn as five squares stretched across twenty tracks.
  const ceiling = Math.max(1, Math.min(count, Math.floor(width / Math.max(1, min))));
  const allowed: CellFit[] = [];
  for (let columns = 1; columns <= ceiling; columns += 1) {
    const fit = solve(columns);
    if (fit.size <= max && fit.size >= min) allowed.push(fit);
  }

  // No column count lands the Cell inside the clamp.
  //
  // This is not an edge case, it is arithmetic: going from `c` to `c + 1`
  // columns shrinks the Cell by about `1 / c`, so unless `max / min` is at
  // least `(c + 1) / c` there are pane widths that no count can serve. At six
  // columns that needs `max >= 1.17 * min` — a 44–48 clamp spans 9% where the
  // step is 16%, so it leaves gaps.
  //
  // Filling wins over the clamp there, because dead space at the edge is
  // visible on every Cell while a Cell a few pixels outside the range is not.
  // The count chosen is the one that misses by least.
  const first = allowed[0];
  if (first === undefined) {
    const missBy = (fit: CellFit) => Math.max(min - fit.size, fit.size - max, 0);
    let nearest = solve(1);
    for (let columns = 2; columns <= ceiling; columns += 1) {
      const fit = solve(columns);
      if (missBy(fit) < missBy(nearest)) nearest = fit;
    }
    return nearest;
  }

  // Fewest columns is the largest Cell; add columns only to buy back height,
  // and only while the Cell still qualifies. The column floor is honoured where
  // the width allows it — it cannot force a Cell out of range.
  const preferred = allowed.find((fit) => fit.columns >= minCols) ?? first;
  if (!tallerThanPane(preferred)) return preferred;
  return allowed.at(-1) ?? preferred;
};
