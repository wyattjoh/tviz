/**
 * What fills one Cell, docked in the Workbench's Inspector region.
 *
 * Docked rather than a floating tooltip: the list of items is the answer to
 * "what is actually in there", and a tooltip that vanishes when the pointer
 * moves cannot be read, compared or clicked through. Hovering a Cell fills the
 * region; clicking one pins it so the list survives the pointer leaving the
 * grid. The rail remains available above it in the desktop sidebar, and on a
 * phone the Workbench raises this region as an Info Pane.
 *
 * The panel is a fixed height at every width and scrolls within it, so changing
 * the Cell cannot resize either the desktop sidebar or the phone overlay.
 */
import { CATEGORY_LABELS, MESSAGE_KIND_LABELS } from "../domain/context.ts";
import type { GridFilters } from "./filters.ts";
import { isCellHidden } from "./filters.ts";
import { formatTokens } from "./format.ts";
import type { Cell } from "./grid.ts";
import { ScrollArea } from "./ScrollArea.tsx";
import { cellFillClass } from "./theme.ts";

/**
 * How many items to list before summarising the rest in a hover preview.
 *
 * A Cell of 1,000 tokens can overlap dozens of small items, and past a dozen
 * the preview stops being readable. A pinned Cell is an intentional detailed
 * reading, so its full list scrolls inside the panel's fixed height.
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
   * Whether this Cell is the pinned one, rather than merely hovered. A pinned
   * Cell lists every item; a hovered one is capped at {@link ITEM_LIMIT}.
   */
  readonly pinned: boolean;
};

/**
 * One item overlapping the Cell's token range.
 *
 * The number is the item's share of *this* Cell, not its own size: a 40k tool
 * result crosses 40 Cells and holds 1,000 tokens of each. The shares of a Cell
 * therefore sum to the Cell, which is the only reading that makes the list
 * answer "what is in this 1,000 tokens". An item that runs past the Cell says
 * so — `1.0k of 40.0k` — so the Cell's share is never mistaken for the item.
 */
type ItemRowProps = {
  readonly label: string;
  readonly tokens: number;
  readonly itemTokens: number;
};

const ItemRow = ({ label, tokens, itemTokens }: ItemRowProps) => (
  <li className="flex items-baseline gap-2 rounded bg-ui-canvas px-2 py-1 text-[11px]">
    {/* `min-w-0` is what makes `truncate` work at all here: a flex item's
        default `min-width: auto` floors it at min-content, and `truncate`
        sets `white-space: nowrap`, so the floor is the whole label. An MCP
        tool name then pushes the row wider than the rail instead of
        ellipsing inside it. */}
    <span className="min-w-0 truncate text-ui-text-secondary">{label}</span>
    <span className="ml-auto shrink-0 text-ui-text-faint tabular-nums">{formatTokens(tokens)}</span>
    {itemTokens > tokens ? (
      <span className="shrink-0 text-[10px] text-ui-text-faint tabular-nums">
        of {formatTokens(itemTokens)}
      </span>
    ) : null}
  </li>
);

/**
 * The Inspector's fixed height.
 *
 * Fixed, not `auto`: the Inspector is a desktop sidebar section and a phone
 * overlay, and neither should change size as the reader moves between Cells. Roughly eight
 * rows fit at this type size; anything longer scrolls inside the panel rather
 * than moving anything outside it (ADR-0006).
 */
const INSPECTOR_HEIGHT = "h-48";

/**
 * Describes the Cell under the pointer, or the pinned one, at a height that
 * never depends on which Cell that is.
 */
export const Inspector = (props: InspectorProps) => (
  <ScrollArea className={INSPECTOR_HEIGHT}>
    <InspectorBody {...props} />
  </ScrollArea>
);

const InspectorBody = ({ cell, filters, pinned }: InspectorProps) => {
  if (cell === undefined) {
    return <p className="text-[11px] leading-snug text-ui-text-faint">Hover a Cell.</p>;
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

  const shown = pinned ? cell.items : cell.items.slice(0, ITEM_LIMIT);
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
        {shown.map((entry, order) => (
          // Two items of one Cell can share a label — two tool results, two
          // reminders — so the position in the Cell is the only stable key.
          <ItemRow
            key={`${order}-${entry.item.label}`}
            label={entry.item.label}
            tokens={entry.tokens}
            itemTokens={entry.item.tokens}
          />
        ))}
      </ul>
      {rest > 0 ? (
        <p className="mt-1 text-[11px] text-ui-text-faint">+{rest} more in this cell</p>
      ) : null}
    </div>
  );
};
