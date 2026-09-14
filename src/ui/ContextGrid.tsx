/**
 * The append-only context grid: one Cell per 1,000 tokens of the Context
 * Window, laid out in the order items entered the context (ADR-0006).
 *
 * Cells are sized to fill the grid pane — `fitCells` takes the pane's width and
 * height and hands back the Cell, the gap and the column count that make the
 * whole Context Window fill it, clamped at both ends so a small window stops
 * growing and a big one bottoms out and scrolls.
 *
 * The layout arrives already built (`buildCells`), which is what keeps
 * filtering honest: filters reach the Cell's *colour* and nothing else, so a
 * hidden Category or Message Kind blanks its Cells in place and no Cell can
 * move. Hovering, focusing or clicking a Cell is reported upwards by index —
 * the Inspector lives in the right rail, not on the pointer.
 *
 * A Cell under the pointer or keyboard focus lifts: a small translate up and
 * to the left, a slight scale and a shadow onto the canvas, so the Cell the
 * Inspector is describing is the one that stands proud of the grid. The pinned
 * Cell holds the lift, with its outline, so the Cell the rail is focused on
 * stays raised while the pointer roams.
 */
import {
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CATEGORY_LABELS, MESSAGE_KIND_LABELS } from "../domain/context.ts";
import { fitCells } from "./cell-fit.ts";
import type { GridFilters } from "./filters.ts";
import { isCellHidden } from "./filters.ts";
import { formatTokens } from "./format.ts";
import type { Cell } from "./grid.ts";
import { cellFillClass } from "./theme.ts";

/**
 * The pane the grid is drawn in, in pixels, before it has been measured.
 * `fitCells` reads this as "not measured yet" and falls back to a fixed Cell.
 */
const UNMEASURED = { width: 0, height: 0 } as const;

/**
 * Tracks the size of the pane the grid is drawn in, both ways: the Cell now
 * follows the pane's height as well as its width.
 *
 * A callback ref rather than `useRef` + `useEffect`: the pane mounts and
 * unmounts with the Session, long after this hook first runs. `contentRect` is
 * the pane's content box, which is the space the block actually has.
 */
const usePaneSize = (): readonly [
  (node: HTMLElement | null) => void,
  { readonly width: number; readonly height: number },
] => {
  const [pane, setPane] = useState<{ readonly width: number; readonly height: number }>(UNMEASURED);
  const [observer] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          if (rect === undefined || rect.width <= 0) return;
          setPane({ width: rect.width, height: rect.height });
        }),
  );

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (observer === undefined) return;
      observer.disconnect();
      if (node !== null) observer.observe(node);
    },
    [observer],
  );

  return [ref, pane] as const;
};

/**
 * Hover text for a Cell: what fills it, which tokens of the window it covers,
 * the items reaching into it, and whether a filter is blanking it.
 */
const describeCell = (cell: Cell, filters: GridFilters): string => {
  const range = `${formatTokens(cell.start)}–${formatTokens(cell.end)}`;
  if (cell.fill === "free") return `Free · ${range}`;
  const category =
    filters.colourByKind && cell.kind !== undefined
      ? `${CATEGORY_LABELS[cell.fill]} · ${MESSAGE_KIND_LABELS[cell.kind]}`
      : CATEGORY_LABELS[cell.fill];
  const items = cell.items.map((entry) => entry.item.label).join(", ");
  const hidden = isCellHidden(cell, filters) ? " · hidden" : "";
  return `${category} · ${range} · ${items}${hidden}`;
};

/**
 * Every Cell's classes: the shape, and the lift on hover or keyboard focus.
 *
 * Pure CSS rather than pointer-tracking tilt: at the 8px end of the Cell range
 * a tilt is invisible, and a lift reads as depth at every size. `relative` is
 * what lets the raised `z-index` paint the lifted Cell over its neighbours.
 * `motion-reduce` drops the transition, not the lift — the state still has to
 * be seen.
 */
const CELL_CLASS =
  "relative cursor-pointer rounded-[2px] outline-offset-2 transition-transform duration-150 ease-out motion-reduce:transition-none " +
  "hover:z-10 hover:-translate-x-px hover:-translate-y-0.5 hover:scale-125 hover:shadow-md hover:shadow-cell-lift/70 " +
  "focus-visible:z-10 focus-visible:-translate-x-px focus-visible:-translate-y-0.5 focus-visible:scale-125 focus-visible:shadow-md focus-visible:shadow-cell-lift/70";

/**
 * The pinned Cell holds the lift, and its outline says which one it is.
 */
const PINNED_CELL_CLASS =
  "z-10 -translate-x-px -translate-y-0.5 scale-125 shadow-md shadow-cell-lift/70 outline-2 outline-ui-focus";

/**
 * Reads the Cell a delegated pointer or focus event landed on.
 *
 * The handlers sit on the container rather than on every Cell: a 1M window is
 * 1,000 Cells, and one listener beats 4,000 closures re-created on every step
 * of the Scrubber.
 */
const cellIndexOf = (target: EventTarget): number | undefined => {
  if (!(target instanceof HTMLElement)) return undefined;
  const raw = target.dataset["cellIndex"];
  if (raw === undefined) return undefined;
  const index = Number.parseInt(raw, 10);
  return Number.isNaN(index) ? undefined : index;
};

/**
 * Props for {@link ContextGrid}.
 */
export type ContextGridProps = {
  /**
   * The Cells of the selected API Call, already laid out by `buildCells`.
   */
  readonly cells: readonly Cell[];
  /**
   * The Context Window used as the grid's denominator, for the summary label.
   */
  readonly windowSize: number;
  /**
   * Measured Tokens of the selected API Call, for the summary label.
   */
  readonly measuredTotal: number;
  /**
   * Which Categories and Message Kinds are blanked, and how Messages Cells are
   * coloured.
   */
  readonly filters: GridFilters;
  /**
   * The pinned Cell, whose Inspector entry survives the pointer leaving.
   */
  readonly pinnedIndex: number | undefined;
  /**
   * Called with the Cell the pointer or keyboard focus is on, and with
   * `undefined` when it leaves the grid.
   */
  readonly onInspect: (index: number | undefined) => void;
  /**
   * Called when a Cell is clicked, to pin it or to unpin it again.
   */
  readonly onPin: (index: number) => void;
  /**
   * Called when the grid gains or loses content below the fold.
   *
   * The scroll-fade that announces it is drawn by the shell, not here: it has
   * to sit above whatever is covering the grid — an open Info Pane, or the tab
   * bar when none is open — and the grid does not know what that is.
   */
  readonly onMoreBelowChange?: (moreBelow: boolean) => void;
};

/**
 * Draws one Context Snapshot as a grid of Cells.
 */
export const ContextGrid = ({
  cells,
  windowSize,
  measuredTotal,
  filters,
  pinnedIndex,
  onInspect,
  onPin,
  onMoreBelowChange,
}: ContextGridProps) => {
  const [paneRef, pane] = usePaneSize();
  // The Cell is a function of the pane and the size of the window, and of
  // nothing else — no Session state reaches it, so two Sessions on the same
  // window in the same pane draw the same grid.

  // The gap and the column count reach the DOM; the size does not — it is what
  // `fitCells` solved *for*, and CSS reproduces it exactly from the tracks. It
  // is still read here to know whether the block overflows the pane.
  const { size, gap, columns } = useMemo(
    () => fitCells(cells.length, pane.width, pane.height),
    [cells.length, pane.width, pane.height],
  );

  // Whether there is grid below the fold, and whether the reader has already
  // reached it. Splitting the question this way means the first paint is right
  // without reading the DOM: a block taller than the pane at scroll position
  // zero always has more below.
  const rows = Math.ceil(cells.length / columns);
  const overflows = rows * size + (rows - 1) * gap > pane.height;
  const [atBottom, setAtBottom] = useState(false);
  // Whether anything has been scrolled past. Unlike the bottom, the grid's top
  // edge has nothing floating over it at any width, so this fade is drawn here
  // rather than handed to the shell.
  const [scrolledPast, setScrolledPast] = useState(false);
  const onScroll = useCallback((event: SyntheticEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    // One pixel of slack: fractional Cell sizes make an exact equality here
    // flicker on the last row.
    const reached = el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
    // Guarded, so scrolling through a 1,000-Cell grid re-renders twice — on the
    // way in and on the way out — rather than on every frame.
    setAtBottom((was) => (was === reached ? was : reached));
    const past = el.scrollTop > 1;
    setScrolledPast((was) => (was === past ? was : past));
  }, []);

  // Reported upwards rather than drawn here: the fade has to sit on top of
  // whatever is covering the grid's bottom edge — an open Info Pane, or the tab
  // bar when none is open — and only the shell knows which that is. The grid
  // knows the other half: whether there is anything left to scroll to.
  const moreBelow = overflows && !atBottom;
  useEffect(() => {
    onMoreBelowChange?.(moreBelow);
  }, [moreBelow, onMoreBelowChange]);
  const blockRef = useRef<HTMLDivElement>(null);
  // Roving tabindex: one Cell of the grid is in the tab order and the arrow
  // keys move between Cells. A window of 1,000 Cells would otherwise be 1,000
  // tab stops between the grid and the rail.
  const [focusIndex, setFocusIndex] = useState(0);
  // Switching the Context Window override shortens the grid, and a tab stop
  // past the end would leave the grid unreachable by keyboard.
  const tabStop = Math.min(focusIndex, cells.length - 1);

  const focusCell = useCallback((index: number) => {
    setFocusIndex(index);
    const node = blockRef.current?.children[index];
    if (node instanceof HTMLElement) node.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const from = cellIndexOf(event.target);
      if (from === undefined) return;
      const step =
        event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowDown"
              ? columns
              : event.key === "ArrowUp"
                ? -columns
                : undefined;
      const to =
        step !== undefined
          ? from + step
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? cells.length - 1
              : undefined;
      if (to === undefined) return;
      event.preventDefault();
      focusCell(Math.max(0, Math.min(cells.length - 1, to)));
    },
    [cells.length, columns, focusCell],
  );

  const inspectFrom = useCallback(
    (event: SyntheticEvent) => {
      const index = cellIndexOf(event.target);
      if (index !== undefined) onInspect(index);
    },
    [onInspect],
  );

  const onClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const index = cellIndexOf(event.target);
      if (index !== undefined) onPin(index);
    },
    [onPin],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* The pane takes whatever height the Workbench's grid region has, and
          both of its dimensions size the Cells. It still scrolls, for the
          windows too big to fit at the minimum Cell. `scrollbarGutter` keeps
          the width — and so the Cell — from oscillating when the block grows
          just tall enough to need a scrollbar. */}
      <div
        ref={paneRef}
        // Vertical only: the block is solved to the pane's width at every Cell
        // size, so a horizontal scrollbar can only ever mean a rounding
        // overshoot of a pixel or two — and on a phone it steals the swipe that
        // should be scrolling the grid down.
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2 md:p-5"
        style={{ scrollbarGutter: "stable" }}
      >
        <div
          ref={blockRef}
          // `1fr` tracks rather than a pixel width: `fitCells` solves for the
          // column count and CSS does the division, so the block spans the pane
          // exactly and no rounding remainder is left at the edge. The Cell's
          // squareness comes from `aspect-square` on the Cell itself.
          className="grid w-full"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: `${gap}px`,
          }}
          role="group"
          aria-label={`Context grid: ${formatTokens(measuredTotal)} of ${formatTokens(
            windowSize,
          )} tokens used`}
          onMouseOver={inspectFrom}
          onFocus={inspectFrom}
          onMouseLeave={() => onInspect(undefined)}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          {cells.map((cell) => {
            const label = describeCell(cell, filters);
            return (
              <button
                type="button"
                key={cell.index}
                data-cell-index={cell.index}
                tabIndex={cell.index === tabStop ? 0 : -1}
                aria-pressed={cell.index === pinnedIndex}
                aria-label={label}
                className={`${CELL_CLASS} aspect-square w-full ${cellFillClass(cell, filters)} ${
                  cell.index === pinnedIndex ? PINNED_CELL_CLASS : ""
                }`}
                title={label}
              />
            );
          })}
        </div>

        {/* Lets the last row be scrolled clear of whatever floats over the
            bottom edge — the tab bar, and any open Info Pane. The shell
            publishes that height as an inherited custom property, since it is
            the only thing that knows it, and zeroes it from `md` up where
            nothing floats.

            A spacer inside the scroll content rather than padding on the pane:
            padding would come out of the pane's *content box*, which is the
            height `fitCells` measures — so opening an Info Pane would re-size
            every Cell, which is the whole thing the floating layout exists to
            prevent. A child changes the scroll length and nothing else. */}
        <div aria-hidden="true" style={{ height: "var(--tviz-obscured-bottom, 0px)" }} />
      </div>

      {/* Says the grid continues above the fold. The counterpart at the bottom
          belongs to the shell, because an Info Pane or the tab bar may be
          covering that edge — nothing ever covers this one, so it is drawn
          here. A sibling of the scroll container, or it would scroll away with
          the content it is describing. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-ui-canvas to-transparent transition-opacity duration-200 motion-reduce:transition-none ${
          scrolledPast ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
};
