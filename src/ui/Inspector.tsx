/**
 * What fills one Cell, docked in the right rail.
 *
 * Docked rather than a floating tooltip: the list of items is the answer to
 * "what is actually in there", and a tooltip that vanishes when the pointer
 * moves cannot be read, compared or clicked through. Hovering a Cell fills the
 * panel; clicking one pins it so the list survives the pointer leaving the
 * grid, and the panel keeps its place in the rail either way.
 */
import { CATEGORY_LABELS, MESSAGE_KIND_LABELS } from "../domain/context.ts";
import type { GridFilters } from "./filters.ts";
import { isCellHidden } from "./filters.ts";
import { formatTokens } from "./format.ts";
import type { Cell } from "./grid.ts";
import { cellFillClass } from "./theme.ts";

/**
 * How many items to list before summarising the rest.
 *
 * A Cell of 1,000 tokens can overlap dozens of small items; past a dozen the
 * list stops being readable and the rail starts scrolling instead.
 */
const ITEM_LIMIT = 12;

/**
 * Props for {@link Inspector}.
 */
export type InspectorProps = {
  /**
   * The Cell being described: the one under the pointer, else the pinned one.
   */
  readonly cell: Cell | undefined;
  /**
   * The filters, which decide the swatch colour and whether the Cell is blanked.
   */
  readonly filters: GridFilters;
  /**
   * Whether this Cell is the pinned one, rather than merely hovered.
   */
  readonly pinned: boolean;
};

/**
 * One item overlapping the Cell's token range.
 */
type ItemRowProps = {
  readonly label: string;
  readonly tokens: number;
};

const ItemRow = ({ label, tokens }: ItemRowProps) => (
  <li className="flex items-baseline gap-2 rounded bg-ui-canvas px-2 py-1 text-[11px]">
    <span className="truncate text-ui-text-secondary">{label}</span>
    <span className="ml-auto shrink-0 text-ui-text-faint tabular-nums">{formatTokens(tokens)}</span>
  </li>
);

/**
 * Describes the Cell under the pointer, or the pinned one.
 */
export const Inspector = ({ cell, filters, pinned }: InspectorProps) => {
  if (cell === undefined) {
    return (
      <p className="text-[11px] leading-snug text-ui-text-faint">
        Hover a Cell to see the items filling it; click one to pin it here.
      </p>
    );
  }

  const range = `${formatTokens(cell.start)}–${formatTokens(cell.end)}`;
  const position = `cell ${cell.index + 1} · ${range}${pinned ? " · pinned" : ""}`;

  if (cell.fill === "free") {
    return (
      <div>
        <div className="flex items-center gap-2">
          <span
            className={`h-3 w-3 shrink-0 rounded-[2px] ring-1 ring-ui-border ${cellFillClass(
              cell,
              filters,
            )}`}
            aria-hidden="true"
          />
          <span className="text-xs text-ui-text">Free</span>
        </div>
        <p className="mt-1 text-[11px] text-ui-text-faint">{position}</p>
        <p className="mt-2 text-[11px] leading-snug text-ui-text-muted">
          free — nothing has reached this part of the Context Window.
        </p>
      </div>
    );
  }

  const shown = cell.items.slice(0, ITEM_LIMIT);
  const rest = cell.items.length - shown.length;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`h-3 w-3 shrink-0 rounded-[2px] ${cellFillClass(cell, filters)}`}
          aria-hidden="true"
        />
        <span className="text-xs text-ui-text">{CATEGORY_LABELS[cell.fill]}</span>
        {cell.kind === undefined ? null : (
          <span className="text-[11px] text-ui-text-muted">{MESSAGE_KIND_LABELS[cell.kind]}</span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-ui-text-faint">{position}</p>
      {isCellHidden(cell, filters) ? (
        <p className="mt-1 text-[11px] text-ui-text-muted">
          blanked by a filter; its tokens still count
        </p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {shown.map((item, order) => (
          // Two items of one Cell can share a label — two tool results, two
          // reminders — so the position in the Cell is the only stable key.
          <ItemRow key={`${order}-${item.label}`} label={item.label} tokens={item.tokens} />
        ))}
      </ul>
      {rest > 0 ? (
        <p className="mt-1 text-[11px] text-ui-text-faint">+{rest} more in this cell</p>
      ) : null}
    </div>
  );
};
