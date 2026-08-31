/**
 * Lays a Context Snapshot out as an append-only grid of fixed-quantum Cells
 * (ADR-0006).
 *
 * Cells are not grouped by Category: they follow `ContextSnapshot.items`, the
 * order things entered the context. Advancing one API Call therefore only fills
 * Cells at the frontier, and a compaction is the single event that rewrites
 * earlier ones. A Cell is always {@link CELL_TOKENS} tokens, so the Context
 * Window changes the Cell *count* rather than the Cell size, and the grid always
 * spans the whole window with free Cells past the measured total.
 */
import type { Category, ContextItem } from "../domain/context.ts";

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
 * Picks the Category that owns most of a Cell's range.
 *
 * Ties go to the Category that entered the context first — the Map is filled in
 * context order and only a strictly larger overlap displaces the leader — so a
 * Cell's colour cannot flip as later calls append behind it. Free space never
 * competes: any Category reaching a Cell colours it, otherwise the frontier item
 * would vanish whenever it filled less than half of its last Cell.
 */
const majorityCategory = (firstEntered: Category, overlaps: readonly Overlap[]): Category => {
  const byCategory = new Map<Category, number>();
  for (const { item, overlap } of overlaps) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + overlap);
  }

  let winner: Category = firstEntered;
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
 * Assigns every Cell of the Context Window a fill.
 *
 * `items` must be in context order (`ContextSnapshot.items`); the layout is that
 * order, so sorting them first would defeat the whole design. Items past the end
 * of the window are simply not drawn: an overflowing Context Snapshot fills the
 * grid rather than growing it.
 */
export const buildCells = (items: readonly ContextItem[], windowSize: number): readonly Cell[] => {
  const spans = spanItems(items);
  const cellCount = cellCountFor(windowSize);
  const cells: Cell[] = [];
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

    const first = overlaps[0];
    if (first === undefined) {
      cells.push({ index, start, end, fill: "free", items: [] });
      continue;
    }

    cells.push({
      index,
      start,
      end,
      fill: majorityCategory(first.item.category, overlaps),
      // Biggest contributor first, so a hover list reads as "mostly this".
      // `sort` is stable, so equal overlaps keep their context order.
      items: [...overlaps]
        .sort((left, right) => right.overlap - left.overlap)
        .map((entry) => entry.item),
    });
  }

  return cells;
};
