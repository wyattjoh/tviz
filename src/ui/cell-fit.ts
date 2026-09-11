/**
 * How large a Cell is drawn.
 *
 * A Cell is always {@link CELL_TOKENS} tokens, but its *physical* size is
 * whatever makes the whole Context Window fill the grid pane: the largest
 * square that fits `count` Cells inside the pane's width **and** height, within
 * a clamp (ADR-0006). A 1M window in a wide pane therefore draws smaller Cells
 * than a 200k window in the same pane — the block fills the space either way,
 * and how full the window is stays the thing the grid answers.
 *
 * The clamp is what keeps both ends honest. Below {@link MIN_CELL_PX} the Cells
 * stop shrinking and the pane scrolls instead, which is the reading the grid
 * had before this was responsive at all; above {@link MAX_CELL_PX} a small
 * window stops growing rather than becoming a wall of tiles.
 *
 * The geometry lives here rather than in the component so the shape of the
 * block is testable without a DOM, the way the Scrubber's chart is.
 */

/**
 * Smallest Cell drawn. Past this the pane scrolls rather than shrinking Cells
 * into something too small to hover or tell apart.
 */
export const MIN_CELL_PX = 8;

/**
 * Largest Cell drawn, so a small Context Window in a big pane stops growing
 * instead of filling it with a handful of tiles.
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
 */
export const FALLBACK_CELL_PX = 16;

/**
 * Columns drawn before the pane has been measured.
 */
export const FALLBACK_COLUMNS = 20;

/**
 * Fewest columns to draw, so a pane too narrow even for minimum-size Cells
 * scrolls sideways instead of collapsing the grid into a single tall strip.
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
 * Columns of this size that fit across a pane of this width.
 */
const columnsFor = (width: number, size: number, gap: number): number =>
  Math.max(MINIMUM_COLUMNS, Math.floor((width + gap) / (size + gap)));

/**
 * The block drawn before the pane has been measured.
 */
const FALLBACK: CellFit = {
  size: FALLBACK_CELL_PX,
  gap: gapFor(FALLBACK_CELL_PX),
  columns: FALLBACK_COLUMNS,
};

/**
 * The block `count` Cells of this size make in a pane of this width.
 */
const fitAt = (size: number, width: number): CellFit => {
  const gap = gapFor(size);
  return { size, gap, columns: columnsFor(width, size, gap) };
};

/**
 * Whether `count` Cells of this size fit the pane.
 *
 * Only one arrangement needs checking: packing as many columns as the width
 * takes is what makes the block shortest, so if that one is too tall, no other
 * arrangement of the same Cell fits either.
 */
const fitsAt = (count: number, size: number, width: number, height: number): boolean => {
  const { gap, columns } = fitAt(size, width);
  if (columns * size + (columns - 1) * gap > width) return false;
  const rows = Math.ceil(count / columns);
  return rows * size + (rows - 1) * gap <= height;
};

/**
 * Fits `count` Cells into a pane of `width` × `height` pixels.
 *
 * Walks whole pixel sizes down from {@link MAX_CELL_PX} and takes the first
 * that fits, rather than solving for a size: the gap is floored to whole pixels
 * and the rows are a `ceil`, so the drawn block is a step function of the size
 * and an algebraic solution is only ever a conservative bound on it. The range
 * is short enough — a few dozen sizes — that walking it is exact and cheap.
 *
 * Nothing fitting means the window is too big for the pane, which is the
 * scrolling case: the Cells stay at {@link MIN_CELL_PX} and the block runs off
 * the bottom, exactly as it did when Cells had one fixed size.
 */
export const fitCells = (count: number, width: number, height: number): CellFit => {
  if (count <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return FALLBACK;
  if (width <= 0 || height <= 0) return FALLBACK;

  for (let size = MAX_CELL_PX; size > MIN_CELL_PX; size -= 1) {
    if (fitsAt(count, size, width, height)) return fitAt(size, width);
  }
  return fitAt(MIN_CELL_PX, width);
};
