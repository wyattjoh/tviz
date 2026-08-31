/**
 * The append-only context grid: one Cell per 1,000 tokens of the Context
 * Window, laid out in the order items entered the context (ADR-0006).
 *
 * Cells keep their physical size, so the number of columns comes from the width
 * of the grid pane and the pane scrolls when the block outgrows it.
 *
 * The layout arrives already built (`buildCells`), which is what keeps
 * filtering honest: filters reach the Cell's *colour* and nothing else, so a
 * hidden Category or Message Kind blanks its Cells in place and no Cell can
 * move. Hovering, focusing or clicking a Cell is reported upwards by index —
 * the Inspector lives in the right rail, not on the pointer.
 */
import {
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { CATEGORY_LABELS, MESSAGE_KIND_LABELS } from "../domain/context.ts";
import type { GridFilters } from "./filters.ts";
import { isCellHidden } from "./filters.ts";
import { formatTokens } from "./format.ts";
import { type Cell, CELL_TOKENS } from "./grid.ts";
import { cellFillClass } from "./theme.ts";

/**
 * Physical size of a Cell, in pixels. Constant across Sessions and Context
 * Windows: a bigger window means more Cells, never smaller ones.
 */
const CELL_SIZE_PX = 16;

/**
 * Gap between Cells, in pixels.
 */
const CELL_GAP_PX = 3;

/**
 * Columns to draw before the pane has been measured — the first paint, and any
 * environment without `ResizeObserver` (jsdom).
 */
const FALLBACK_COLUMNS = 20;

/**
 * Fewest columns to draw, so a very narrow pane scrolls sideways instead of
 * collapsing the grid into a single tall strip.
 */
const MINIMUM_COLUMNS = 8;

/**
 * Columns that fit in a pane of this width.
 */
const columnsForWidth = (width: number): number =>
  Math.max(MINIMUM_COLUMNS, Math.floor((width + CELL_GAP_PX) / (CELL_SIZE_PX + CELL_GAP_PX)));

/**
 * Tracks how many Cells fit across the pane it is attached to.
 *
 * A callback ref rather than `useRef` + `useEffect`: the pane mounts and
 * unmounts with the Session, long after this hook first runs.
 */
const useColumnCount = (): readonly [(node: HTMLElement | null) => void, number] => {
  const [columns, setColumns] = useState(FALLBACK_COLUMNS);
  const [observer] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver((entries) => {
          const width = entries[0]?.contentRect.width;
          if (width !== undefined && width > 0) setColumns(columnsForWidth(width));
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

  return [ref, columns] as const;
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
  const items = cell.items.map((item) => item.label).join(", ");
  const hidden = isCellHidden(cell, filters) ? " · hidden" : "";
  return `${category} · ${range} · ${items}${hidden}`;
};

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
}: ContextGridProps) => {
  const [paneRef, columns] = useColumnCount();
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
    <div className="flex h-full min-h-0 flex-col">
      {/* The pane takes whatever height the Workbench's grid region has and
          scrolls when the block outgrows it. `scrollbarGutter` keeps the column
          count from oscillating when the grid grows just tall enough to need a
          scrollbar. */}
      <div
        ref={paneRef}
        className="min-h-0 flex-1 overflow-auto p-5"
        style={{ scrollbarGutter: "stable" }}
      >
        <div
          ref={blockRef}
          className="grid w-fit"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${CELL_SIZE_PX}px)`,
            gap: `${CELL_GAP_PX}px`,
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
                className={`cursor-pointer rounded-[2px] outline-offset-2 ${cellFillClass(
                  cell,
                  filters,
                )} ${cell.index === pinnedIndex ? "outline-2 outline-ui-focus" : ""}`}
                style={{ width: CELL_SIZE_PX, height: CELL_SIZE_PX }}
                title={label}
              />
            );
          })}
        </div>
      </div>

      <p className="border-t border-ui-border px-5 py-2 text-[11px] text-ui-text-faint">
        {cells.length} cells × {formatTokens(CELL_TOKENS)} tokens, in the order they entered the
        context · click a cell to pin it in the Inspector
      </p>
    </div>
  );
};
