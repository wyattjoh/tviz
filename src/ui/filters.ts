/**
 * Which Categories and Message Kinds the grid is currently showing.
 *
 * Filtering is **purely visual**: it never reaches the layout. `buildCells`
 * takes no filters, so hiding a Category or a Message Kind cannot move a Cell —
 * the Cell it hides keeps its position and is blanked in place (ADR-0006).
 * Under an append-only layout, dropping the hidden items instead would shift
 * every Cell behind them, which is exactly the re-flow that decision exists to
 * avoid. Legend totals come from the Context Snapshot, so they are unaffected
 * too, and the proportions two Sessions are compared on stay stable.
 */
import type { Category, MessageKind } from "../domain/context.ts";
import type { Cell } from "./grid.ts";

/**
 * The state of the legend's filters.
 */
export type GridFilters = {
  /**
   * Categories toggled off. Hidden rather than absent, so what is left is still
   * read against the whole window.
   */
  readonly hiddenCategories: ReadonlySet<Category>;
  /**
   * Message Kinds toggled off, within the Messages Category.
   */
  readonly hiddenKinds: ReadonlySet<MessageKind>;
  /**
   * Whether Messages Cells take their colour from their Message Kind instead of
   * the Messages Category accent. Other Categories are unaffected.
   */
  readonly colourByKind: boolean;
};

/**
 * Everything shown, coloured by Category: what a Session opens on.
 */
export const ALL_SHOWN: GridFilters = {
  hiddenCategories: new Set<Category>(),
  hiddenKinds: new Set<MessageKind>(),
  colourByKind: false,
};

/**
 * The set with `value` added when it was absent and removed when it was there.
 */
const toggledIn = <A>(set: ReadonlySet<A>, value: A): ReadonlySet<A> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

/**
 * Shows a hidden Category, or hides a shown one.
 */
export const toggleCategory = (filters: GridFilters, category: Category): GridFilters => ({
  ...filters,
  hiddenCategories: toggledIn(filters.hiddenCategories, category),
});

/**
 * Shows a hidden Message Kind, or hides a shown one.
 */
export const toggleMessageKind = (filters: GridFilters, kind: MessageKind): GridFilters => ({
  ...filters,
  hiddenKinds: toggledIn(filters.hiddenKinds, kind),
});

/**
 * Switches Messages Cells between the Category accent and the Kind accents.
 */
export const withColourByKind = (filters: GridFilters, colourByKind: boolean): GridFilters => ({
  ...filters,
  colourByKind,
});

/**
 * Whether a Category's Cells are currently blanked.
 */
export const isCategoryHidden = (filters: GridFilters, category: Category): boolean =>
  filters.hiddenCategories.has(category);

/**
 * Whether a Message Kind's Cells are currently blanked — by its own toggle, or
 * by Messages, the Category it lives in, being hidden.
 *
 * The parent Category wins. `isCellHidden` blanks every Messages Cell the
 * moment the Category is off, so a Kind that only consulted `hiddenKinds` would
 * report itself shown while none of its Cells were drawn, and the legend row
 * saying so — filled swatch, `aria-pressed="true"` — would contradict the grid.
 */
export const isMessageKindHidden = (filters: GridFilters, kind: MessageKind): boolean =>
  filters.hiddenCategories.has("messages") || filters.hiddenKinds.has(kind);

/**
 * Whether a Cell is blanked in place.
 *
 * A Cell is hidden by its own Category, or — for a Messages Cell — by the
 * Message Kind holding most of its range. Free Cells are never hidden: there is
 * nothing there to hide, and blanking them would erase the headroom the grid
 * exists to show.
 */
export const isCellHidden = (cell: Cell, filters: GridFilters): boolean => {
  if (cell.fill === "free") return false;
  if (filters.hiddenCategories.has(cell.fill)) return true;
  return cell.kind !== undefined && filters.hiddenKinds.has(cell.kind);
};
