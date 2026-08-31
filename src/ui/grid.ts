/**
 * Lays a Context Snapshot out as an append-only grid of fixed-quantum Cells
 * (ADR-0006).
 *
 * Cells are not grouped by Category: they follow the cumulative items of a
 * Context Snapshot, in the order things entered the context. Advancing one API
 * Call therefore only fills Cells at the frontier, and a compaction is the
 * single event that rewrites earlier ones. A Cell is always {@link CELL_TOKENS}
 * tokens, so the Context Window changes the Cell *count* rather than the Cell
 * size, and the grid always spans the whole window with free Cells past the
 * measured total.
 */
import { CATEGORY_ORDER, type Category, type ContextItem } from "../domain/context.ts";

/**
 * The tokens one Cell stands for. Fixed, so Cells are comparable across
 * Sessions and Context Windows.
 */
export const CELL_TOKENS = 1_000;

/**
 * What fills a Cell: a Category, or nothing yet.
 */
export type CellFill = Category | "free";

/**
 * One box in the grid: a fixed token range of the Context Window and whatever
 * fills it.
 */
export type Cell = {
  /**
   * Zero-based position in the grid, which is also its position in the window.
   */
  readonly index: number;
  /**
   * First token of the range this Cell covers, inclusive.
   */
  readonly start: number;
  /**
   * Last token of the range this Cell covers, exclusive.
   */
  readonly end: number;
  /**
   * The Category colouring the Cell, or `free` when nothing reaches it.
   */
  readonly fill: CellFill;
  /**
   * The items overlapping this Cell's range, largest overlap first. Empty for a
   * free Cell.
   */
  readonly items: readonly ContextItem[];
};

/**
 * How many Cells a Context Window is drawn as.
 *
 * A 200k window is 200 Cells and a 1M window is 1,000, at the same physical
 * size. A window that is missing or nonsensical still yields one Cell, so the
 * grid is never empty.
 */
export const cellCountFor = (windowSize: number): number => {
  if (!Number.isFinite(windowSize) || windowSize <= 0) return 1;
  return Math.max(1, Math.ceil(windowSize / CELL_TOKENS));
};

/**
 * An item placed at its position in the context, as `[start, end)` tokens.
 */
type Span = {
  readonly item: ContextItem;
  readonly start: number;
  readonly end: number;
};

/**
 * Lays the items out end to end, in context order, skipping the ones too small
 * to cover any tokens.
 */
const spanItems = (items: readonly ContextItem[]): readonly Span[] => {
  const spans: Span[] = [];
  let cursor = 0;
  for (const item of items) {
    if (item.tokens <= 0) continue;
    spans.push({ item, start: cursor, end: cursor + item.tokens });
    cursor += item.tokens;
  }
  return spans;
};

/**
 * The overlap, in tokens, between an item's span and a Cell's range.
 */
const overlapOf = (span: Span, start: number, end: number): number =>
  Math.min(end, span.end) - Math.max(start, span.start);

/**
 * How much of a Cell's range one item covers.
 */
type Overlap = {
  readonly item: ContextItem;
  readonly overlap: number;
};

/**
 * Sums a Cell's overlaps per Category, in the order the Categories first reach
 * into the Cell.
 *
 * `Map` preserves insertion order and `overlaps` arrives in context order, so
 * the first entry is the Category that entered the context first — which is what
 * makes the tie-break below deterministic.
 */
const tokensByCategory = (overlaps: readonly Overlap[]): ReadonlyMap<Category, number> => {
  const byCategory = new Map<Category, number>();
  for (const { item, overlap } of overlaps) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + overlap);
  }
  return byCategory;
};

/**
 * Picks the Category that owns most of a Cell's range.
 *
 * Every overlap is positive, so the first Category in the Map always takes the
 * lead and only a *strictly* larger overlap displaces it: a tie goes to the
 * Category that entered the context first. Free space never competes — any
 * Category reaching a Cell colours it, otherwise the frontier item would vanish
 * whenever it filled less than half of its last Cell.
 *
 * A Cell whose range is fully covered therefore keeps its colour as later calls
 * append behind it. The frontier Cell is the exception: it is only partly
 * covered, so the next API Call fills the rest of its range and the majority can
 * change hands. That is the frontier advancing, not a re-flow — no Cell ever
 * moves (`buildCells` positions every Cell by absolute token offset). See
 * "recolours only the partly-filled frontier Cell" in `grid.test.ts`.
 */
const majorityCategory = (byCategory: ReadonlyMap<Category, number>): Category | undefined => {
  let winner: Category | undefined;
  let best = 0;
  for (const [category, tokens] of byCategory) {
    if (tokens > best) {
      best = tokens;
      winner = category;
    }
  }
  return winner;
};

/**
 * Gives every Category holding tokens at least one Cell.
 *
 * A Category smaller than the quantum — 175 tokens of MCP against a Cell of
 * 1,000 — loses every majority vote and would disappear from a grid whose legend
 * still lists it. Cells are positioned by absolute token offset, so handing one
 * to a starving Category changes that Cell's *colour* only: nothing moves and
 * nothing re-flows, which is all ADR-0006 forbids.
 *
 * The Cell taken is the one where the starving Category covers the most tokens,
 * and only a Category that holds more than one Cell can donate. When no such
 * donor exists — more Categories present than Cells drawn — the floor gives up
 * rather than shuffling colours between two Categories that each hold one Cell.
 */
const applyCategoryFloor = (
  cells: Cell[],
  perCell: readonly (ReadonlyMap<Category, number> | undefined)[],
): void => {
  const cellsHeld = new Map<Category, number>();
  for (const cell of cells) {
    if (cell.fill === "free") continue;
    cellsHeld.set(cell.fill, (cellsHeld.get(cell.fill) ?? 0) + 1);
  }

  for (const category of CATEGORY_ORDER) {
    if ((cellsHeld.get(category) ?? 0) > 0) continue;

    let target: number | undefined;
    let bestOverlap = 0;
    for (const [index, byCategory] of perCell.entries()) {
      const overlap = byCategory?.get(category) ?? 0;
      if (overlap <= bestOverlap) continue;
      const donor = cells[index]?.fill;
      if (donor === undefined || donor === "free" || (cellsHeld.get(donor) ?? 0) <= 1) continue;
      target = index;
      bestOverlap = overlap;
    }

    const cell = target === undefined ? undefined : cells[target];
    if (target === undefined || cell === undefined || cell.fill === "free") continue;
    cellsHeld.set(cell.fill, (cellsHeld.get(cell.fill) ?? 0) - 1);
    cellsHeld.set(category, 1);
    cells[target] = { ...cell, fill: category };
  }
};

/**
 * Assigns every Cell of the Context Window a fill.
 *
 * `items` must be the cumulative items of one Context Snapshot, in context order
 * (`cumulativeItems`); the layout *is* that order, so sorting them first would
 * defeat the whole design. Items past the end of the window are simply not
 * drawn: an overflowing Context Snapshot fills the grid rather than growing it.
 */
export const buildCells = (items: readonly ContextItem[], windowSize: number): readonly Cell[] => {
  const spans = spanItems(items);
  const cellCount = cellCountFor(windowSize);
  const cells: Cell[] = [];
  // What each Cell holds per Category, kept so the floor below can find the Cell
  // a starving Category has the strongest claim on.
  const perCell: (ReadonlyMap<Category, number> | undefined)[] = [];
  // Spans and Cells both advance left to right, so one pointer walks both.
  let firstSpan = 0;

  for (let index = 0; index < cellCount; index += 1) {
    const start = index * CELL_TOKENS;
    const end = start + CELL_TOKENS;

    while (firstSpan < spans.length && (spans[firstSpan]?.end ?? 0) <= start) firstSpan += 1;

    const overlaps: Overlap[] = [];
    for (let cursor = firstSpan; cursor < spans.length; cursor += 1) {
      const span = spans[cursor];
      if (span === undefined || span.start >= end) break;
      const overlap = overlapOf(span, start, end);
      if (overlap > 0) overlaps.push({ item: span.item, overlap });
    }

    const byCategory = tokensByCategory(overlaps);
    const fill = majorityCategory(byCategory);
    if (fill === undefined) {
      cells.push({ index, start, end, fill: "free", items: [] });
      perCell.push(undefined);
      continue;
    }

    cells.push({
      index,
      start,
      end,
      fill,
      // Biggest contributor first, so a hover list reads as "mostly this".
      // `sort` is stable, so equal overlaps keep their context order.
      items: [...overlaps]
        .sort((left, right) => right.overlap - left.overlap)
        .map((entry) => entry.item),
    });
    perCell.push(byCategory);
  }

  applyCategoryFloor(cells, perCell);

  return cells;
};
