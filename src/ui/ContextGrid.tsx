/**
 * The `/context`-style grid: 200 Cells, each a fixed quantum of the Context
 * Window, coloured by the Category that fills it.
 */
import { CATEGORY_LABELS, type ContextSnapshot } from "../domain/context.ts";
import { formatTokens } from "./format.ts";
import { buildCells, CELL_COLUMNS, cellTokenRange } from "./grid.ts";
import { CATEGORY_FILL_CLASS, FREE_FILL_CLASS } from "./theme.ts";

/**
 * Props for {@link ContextGrid}.
 */
export type ContextGridProps = {
  /**
   * The Context Snapshot to draw.
   */
  readonly snapshot: ContextSnapshot;
  /**
   * The Context Window used as the grid's denominator.
   */
  readonly windowSize: number;
};

/**
 * Draws one Context Snapshot as a grid of Cells.
 */
export const ContextGrid = ({ snapshot, windowSize }: ContextGridProps) => {
  const cells = buildCells(snapshot.byCategory, windowSize);

  return (
    <div
      className="grid w-fit gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${CELL_COLUMNS}, 16px)` }}
      role="img"
      aria-label={`Context grid: ${formatTokens(snapshot.measuredTotal)} of ${formatTokens(
        windowSize,
      )} tokens used`}
    >
      {cells.map((fill, index) => {
        const [start, end] = cellTokenRange(index, windowSize);
        return (
          <div
            // Cells are positional, so the index is their identity.
            key={index}
            className={`h-4 w-4 rounded-[2px] ${
              fill === "free" ? FREE_FILL_CLASS : CATEGORY_FILL_CLASS[fill]
            }`}
            title={`${fill === "free" ? "Free" : CATEGORY_LABELS[fill]} · ${formatTokens(
              start,
            )}–${formatTokens(end)}`}
          />
        );
      })}
    </div>
  );
};
