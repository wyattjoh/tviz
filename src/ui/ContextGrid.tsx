/**
 * The append-only context grid: one Cell per 1,000 tokens of the Context
 * Window, laid out in the order items entered the context (ADR-0006).
 *
 * Cells keep their physical size, so the number of columns comes from the width
 * of the grid pane and the pane scrolls when the block outgrows it.
 */
import { useCallback, useMemo, useState } from "react";
import { CATEGORY_LABELS, type ContextSnapshot, cumulativeItems } from "../domain/context.ts";
import { formatTokens } from "./format.ts";
import { buildCells, type Cell, CELL_TOKENS } from "./grid.ts";
import { CATEGORY_FILL_CLASS, FREE_FILL_CLASS } from "./theme.ts";

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
 * and the items reaching into it.
 */
const describeCell = (cell: Cell): string => {
  const range = `${formatTokens(cell.start)}–${formatTokens(cell.end)}`;
  if (cell.fill === "free") return `Free · ${range}`;
  const items = cell.items.map((item) => item.label).join(", ");
  return `${CATEGORY_LABELS[cell.fill]} · ${range} · ${items}`;
};

/**
 * Props for {@link ContextGrid}.
 */
export type ContextGridProps = {
  /**
   * Context Snapshots of the Session, in transcript order. The grid needs the
   * calls before the selected one to rebuild its cumulative items, which the
   * parser does not store per call.
   */
  readonly calls: readonly ContextSnapshot[];
  /**
   * Which API Call to draw.
   */
  readonly callIndex: number;
  /**
   * The Context Window used as the grid's denominator.
   */
  readonly windowSize: number;
};

/**
 * Draws one Context Snapshot as a grid of Cells.
 */
export const ContextGrid = ({ calls, callIndex, windowSize }: ContextGridProps) => {
  const [paneRef, columns] = useColumnCount();
  // The Scrubber re-renders this on every step, and the layout is the same for
  // the same Context Snapshot.
  const cells = useMemo(
    () => buildCells(cumulativeItems(calls, callIndex), windowSize),
    [calls, callIndex, windowSize],
  );
  const snapshot = calls[callIndex];
  if (snapshot === undefined) return null;

  return (
    <div>
      {/* `scrollbarGutter` keeps the column count from oscillating when the
          grid grows just tall enough to need a scrollbar. */}
      <div
        ref={paneRef}
        className="max-h-[60vh] overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div
          className="grid w-fit"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${CELL_SIZE_PX}px)`,
            gap: `${CELL_GAP_PX}px`,
          }}
          role="img"
          aria-label={`Context grid: ${formatTokens(snapshot.measuredTotal)} of ${formatTokens(
            windowSize,
          )} tokens used`}
        >
          {cells.map((cell) => (
            <div
              key={cell.index}
              className={`rounded-[2px] ${
                cell.fill === "free" ? FREE_FILL_CLASS : CATEGORY_FILL_CLASS[cell.fill]
              }`}
              style={{ width: CELL_SIZE_PX, height: CELL_SIZE_PX }}
              title={describeCell(cell)}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-ui-text-faint">
        {cells.length} cells × {formatTokens(CELL_TOKENS)} tokens, in the order they entered the
        context
      </p>
    </div>
  );
};
