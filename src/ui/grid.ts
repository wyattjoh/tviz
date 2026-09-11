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
import {
  CATEGORY_ORDER,
  type Category,
  type ContextItem,
  type MessageKind,
} from "../domain/context.ts";

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
   * The Message Kind holding most of this Cell's range, set only when `fill` is
   * `messages`.
   *
   * Carried by the layout rather than resolved at paint time so that "colour by
   * kind" and hiding a Message Kind read the same value, and so that both stay
   * pure functions of a Cell.
   */
  readonly kind: MessageKind | undefined;
  /**
   * The parts of items overlapping this Cell's range, largest part first. Empty
   * for a free Cell.
   */
  readonly items: readonly CellItem[];
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
 * How much of a Cell's range one item covers.
 *
 * `tokens` is the *overlap*, never the item's own size: an item far larger than
 * the quantum — a 40k tool result — is one of these in each of the 40 Cells it
 * crosses, and each of them reports only the part inside that Cell. Reporting
 * `item.tokens` instead would let a Cell of 1,000 tokens list items summing to
 * 40,000, which is why the whole item is kept beside its share rather than in
 * place of it.
 */
export type CellItem = {
  /**
   * The item reaching into the Cell, with its own label, Category and total.
   */
  readonly item: ContextItem;
  /**
   * How many of this Cell's {@link CELL_TOKENS} tokens that item covers.
   * Always `1 <= tokens <= CELL_TOKENS`.
   */
  readonly tokens: number;
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
 * Sums a Cell's overlaps per Category, in the order the Categories first reach
 * into the Cell.
 *
 * `Map` preserves insertion order and `overlaps` arrives in context order, so
 * the first entry is the Category that entered the context first — which is what
 * makes the tie-break below deterministic.
 */
const tokensByCategory = (overlaps: readonly CellItem[]): ReadonlyMap<Category, number> => {
  const byCategory = new Map<Category, number>();
  for (const { item, tokens } of overlaps) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + tokens);
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
 * Picks the Message Kind that owns most of a Cell's range, among the Messages
 * items reaching into it.
 *
 * Resolved from the same overlaps the Category majority is, and by the same
 * rule: a tie goes to the Kind that entered the context first. Undefined when
 * no Messages item reaches the Cell, which is every Cell of every other
 * Category.
 */
const majorityMessageKind = (overlaps: readonly CellItem[]): MessageKind | undefined => {
  const byKind = new Map<MessageKind, number>();
  for (const { item, tokens } of overlaps) {
    if (item.category !== "messages" || item.kind === undefined) continue;
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + tokens);
  }

  let winner: MessageKind | undefined;
  let best = 0;
  for (const [kind, tokens] of byKind) {
    if (tokens > best) {
      best = tokens;
      winner = kind;
    }
  }
  return winner;
};

/**
 * What one Cell holds, as the one-Cell floor needs to see it.
 */
type CellClaims = {
  /**
   * Tokens of this Cell's range held by each Category reaching into it.
   */
  readonly byCategory: ReadonlyMap<Category, number>;
  /**
   * Categories whose items carry on past this Cell, so they are certain to
   * reach at least one more Cell.
   */
  readonly open: ReadonlySet<Category>;
  /**
   * The Message Kind holding most of this Cell's range, so that a Cell the
   * floor hands to Messages still knows which Kind colours it.
   */
  readonly kind: MessageKind | undefined;
};

/**
 * Nothing is still growing once the grid has run out of Cells.
 */
const NOTHING_OPEN: ReadonlySet<Category> = new Set<Category>();

/**
 * Gives every Category holding tokens at least one Cell, and never takes one
 * back.
 *
 * A Category smaller than the quantum — 175 tokens of MCP against a Cell of
 * 1,000 — loses every majority vote and would disappear from a grid whose legend
 * still lists it. Cells are positioned by absolute token offset, so handing one
 * to a starving Category changes that Cell's *colour* only: nothing moves and
 * nothing re-flows, which is all ADR-0006 forbids.
 *
 * The floor walks the grid from the front and decides each Category **once**, at
 * the Cell where that Category stops reaching further; what it is granted there
 * it keeps for the rest of the Session, even once later API Calls append enough
 * of it to win Cells outright. Deciding globally instead — "does this Category
 * hold a Cell anywhere in the finished grid?" — reads the future, and the future
 * changes: a Category granted a Cell at call 12 would hand it back at call 40,
 * recolouring a settled Cell far behind the frontier, which ADR-0006 forbids.
 * Every input to a grant is therefore taken from the Cells up to the one being
 * settled, and those depend only on a prefix of the items — the same prefix
 * every later Context Snapshot starts with.
 *
 * The Cell taken is the one the starving Category covers most of, and the donor
 * must survive it: it either already holds another Cell or is still growing into
 * the Cells ahead. When no such donor exists — more Categories crowding into a
 * Cell than there are Cells to go round — the floor gives up rather than
 * shuffling colours between two Categories that each hold one Cell.
 */
const applyCategoryFloor = (cells: Cell[], claims: readonly CellClaims[]): void => {
  const cellsHeld = new Map<Category, number>();
  const seen = new Set<Category>();
  const decided = new Set<Category>();

  /**
   * Hands a starving Category the Cell it reaches furthest into, among the Cells
   * walked so far whose holder can afford to lose one.
   */
  const takeCellFor = (category: Category, upTo: number, open: ReadonlySet<Category>): void => {
    let target: number | undefined;
    let bestOverlap = 0;
    for (let index = 0; index <= upTo; index += 1) {
      const overlap = claims[index]?.byCategory.get(category) ?? 0;
      if (overlap <= bestOverlap) continue;
      const donor = cells[index]?.fill;
      if (donor === undefined || donor === "free") continue;
      // The donor keeps a Cell either way: it already holds a second one, or it
      // carries on into Cells this walk has not reached yet.
      if ((cellsHeld.get(donor) ?? 0) < 2 && !open.has(donor)) continue;
      target = index;
      bestOverlap = overlap;
    }

    const cell = target === undefined ? undefined : cells[target];
    if (target === undefined || cell === undefined || cell.fill === "free") return;
    cellsHeld.set(cell.fill, (cellsHeld.get(cell.fill) ?? 0) - 1);
    cellsHeld.set(category, 1);
    cells[target] = {
      ...cell,
      fill: category,
      // Only a Messages Cell carries a Message Kind, so a Cell changing hands
      // either picks up that Cell's majority Kind or gives its own up.
      kind: category === "messages" ? claims[target]?.kind : undefined,
    };
  };

  /**
   * Decides, once and for all, every Category that has stopped reaching further.
   */
  const settleClosed = (upTo: number, open: ReadonlySet<Category>): void => {
    for (const category of CATEGORY_ORDER) {
      if (decided.has(category) || !seen.has(category) || open.has(category)) continue;
      decided.add(category);
      if ((cellsHeld.get(category) ?? 0) === 0) takeCellFor(category, upTo, open);
    }
  };

  for (const [index, { byCategory, open }] of claims.entries()) {
    const fill = cells[index]?.fill;
    if (fill !== undefined && fill !== "free") cellsHeld.set(fill, (cellsHeld.get(fill) ?? 0) + 1);
    for (const category of byCategory.keys()) seen.add(category);
    settleClosed(index, open);
  }

  // A Context Snapshot that overflows the window leaves Categories still
  // reaching past the last Cell drawn; they are settled once the grid runs out.
  settleClosed(cells.length - 1, NOTHING_OPEN);
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
  // What each Cell holds per Category, and which Categories carry on past it:
  // all the one-Cell floor below is allowed to know at that point in the grid.
  const claims: CellClaims[] = [];
  // Spans and Cells both advance left to right, so one pointer walks both.
  let firstSpan = 0;

  for (let index = 0; index < cellCount; index += 1) {
    const start = index * CELL_TOKENS;
    const end = start + CELL_TOKENS;

    while (firstSpan < spans.length && (spans[firstSpan]?.end ?? 0) <= start) firstSpan += 1;

    const overlaps: CellItem[] = [];
    const open = new Set<Category>();
    for (let cursor = firstSpan; cursor < spans.length; cursor += 1) {
      const span = spans[cursor];
      if (span === undefined || span.start >= end) break;
      const overlap = overlapOf(span, start, end);
      if (overlap > 0) overlaps.push({ item: span.item, tokens: overlap });
      if (span.end > end) open.add(span.item.category);
    }

    const byCategory = tokensByCategory(overlaps);
    const kind = majorityMessageKind(overlaps);
    claims.push({ byCategory, open, kind });
    const fill = majorityCategory(byCategory);
    if (fill === undefined) {
      cells.push({ index, start, end, fill: "free", kind: undefined, items: [] });
      continue;
    }

    cells.push({
      index,
      start,
      end,
      fill,
      kind: fill === "messages" ? kind : undefined,
      // Biggest contributor first, so the Inspector's list reads as "mostly
      // this". `sort` is stable, so equal shares keep their context order.
      items: [...overlaps].sort((left, right) => right.tokens - left.tokens),
    });
  }

  applyCategoryFloor(cells, claims);

  return cells;
};
