/**
 * Legend and filters for the grid: tokens and percent of the Context Window per
 * Category, with Messages expanded into its Message Kinds, ending with the
 * free-space line `/context` shows.
 *
 * Every row is also its own filter. Toggling one blanks that Category's or that
 * Message Kind's Cells in place — it never re-flows the grid and it never
 * changes a total on this legend, because the numbers come from the Context
 * Snapshot rather than from the Cells (ADR-0006). What is hidden is still
 * counted, so the percentages two Sessions are compared on stay stable.
 *
 * Every row also says what it counts, in a card that floats under it while it
 * is hovered or focused. The copy lives with the vocabulary in
 * `src/domain/context.ts`, not here, so the words the legend uses for a
 * Category are the words the domain uses for it.
 */
import { Fragment, useId, useState } from "react";
import {
  type Category,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ContextSnapshot,
  FREE_SPACE_DESCRIPTION,
  MESSAGE_KIND_DESCRIPTIONS,
  MESSAGE_KIND_LABELS,
  MESSAGE_KIND_ORDER,
  type MessageKind,
} from "../domain/context.ts";
import { type GridFilters, isCategoryHidden, isMessageKindHidden } from "./filters.ts";
import { formatPercent, formatTokens } from "./format.ts";
import {
  CATEGORY_FILL_CLASS,
  CATEGORY_RING_CLASS,
  FREE_FILL_CLASS,
  MESSAGE_KIND_FILL_CLASS,
  MESSAGE_KIND_RING_CLASS,
} from "./theme.ts";

/**
 * Why the Message Kind rows stop taking clicks: their Category decides for them.
 */
const MESSAGES_HIDDEN_HINT = "Messages is hidden, which blanks every Kind; show Messages to filter";

/**
 * Props for {@link ContextLegend}.
 */
export type ContextLegendProps = {
  /**
   * The Context Snapshot being described.
   */
  readonly snapshot: ContextSnapshot;
  /**
   * The Context Window used as the denominator for percentages.
   */
  readonly windowSize: number;
  /**
   * Which rows are toggled off, and whether Messages is coloured by Kind.
   */
  readonly filters: GridFilters;
  /**
   * Shows or hides one Category's Cells.
   */
  readonly onToggleCategory: (category: Category) => void;
  /**
   * Shows or hides one Message Kind's Cells.
   */
  readonly onToggleMessageKind: (kind: MessageKind) => void;
  /**
   * Switches Messages Cells between the Category accent and the Kind accents.
   */
  readonly onColourByKind: (colourByKind: boolean) => void;
};

/**
 * The swatch of a filter row: filled when shown, an outline when hidden.
 */
type SwatchProps = {
  readonly fillClass: string;
  readonly ringClass: string;
  readonly hidden: boolean;
  readonly small: boolean;
};

const Swatch = ({ fillClass, ringClass, hidden, small }: SwatchProps) => (
  <span
    className={`inline-block shrink-0 rounded-[2px] ${small ? "h-2 w-2" : "h-2.5 w-2.5"} ${
      hidden ? `ring-1 ring-inset ${ringClass}` : fillClass
    }`}
    aria-hidden="true"
  />
);

/**
 * What a row counts, revealed while that row is hovered or focused.
 *
 * The card floats over the rows below rather than pushing them down: the legend
 * is a column of numbers read against each other, and re-flowing it under the
 * pointer would move the row being pointed at. `pointer-events-none` stops it
 * swallowing the hover of whatever it covers, so the pointer walks the list
 * without the card fighting it.
 *
 * This is not the Inspector, which stays docked in the rail: a Cell's contents
 * are read and compared, while a row's description is a one-line reminder of
 * what the bucket means, and does not earn permanent rail height.
 */
type RowDescriptionProps = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /**
   * Why the row's toggle is inert, when it is — said here rather than in a
   * native `title`, so a row never explains itself in two tooltips at once.
   */
  readonly disabledReason: string | undefined;
};

const RowDescription = ({ id, label, description, disabledReason }: RowDescriptionProps) => (
  <div
    id={id}
    role="tooltip"
    className="pointer-events-none absolute top-full right-0 left-0 z-20 mt-1 rounded-md border border-ui-border-strong bg-ui-shell px-2 py-1.5 shadow-lg"
  >
    <p className="text-[10px] tracking-wide text-ui-text-faint uppercase">{label}</p>
    <p className="mt-0.5 text-[11px] leading-snug text-ui-text-secondary">{description}</p>
    {disabledReason === undefined ? null : (
      <p className="mt-1 text-[10px] leading-snug text-ui-text-faint">{disabledReason}</p>
    )}
  </div>
);

/**
 * One toggleable legend row.
 *
 * `aria-pressed` carries the filter state: pressed means the row's Cells are
 * drawn, which is what the filled swatch says visually.
 *
 * A row is `disabled` when something above it already decides the answer — a
 * Message Kind whose Messages Category is hidden. Its Cells are blanked either
 * way, so the toggle could not change the grid, and letting it record a state
 * the reader cannot see would spring that state on them later, when they show
 * Messages again.
 */
type FilterRowProps = {
  readonly fillClass: string;
  readonly ringClass: string;
  readonly label: string;
  readonly description: string;
  readonly descriptionId: string;
  readonly described: boolean;
  readonly onDescribe: (described: boolean) => void;
  readonly tokens: number;
  readonly windowSize: number;
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly disabledReason: string | undefined;
  readonly small: boolean;
  readonly onToggle: () => void;
};

const FilterRow = ({
  fillClass,
  ringClass,
  label,
  description,
  descriptionId,
  described,
  onDescribe,
  tokens,
  windowSize,
  hidden,
  disabled,
  disabledReason,
  small,
  onToggle,
}: FilterRowProps) => (
  // Laid out for the 340px rail: the description floats under its row rather
  // than sitting beside it, so the numbers stay in their columns.
  //
  // The pointer handlers ride on the `li` rather than the button because a
  // disabled button fires no mouse events of its own, and a Message Kind row
  // whose Category is hidden still has something to say about what it counts.
  <li
    className="relative"
    onMouseEnter={() => onDescribe(true)}
    onMouseLeave={() => onDescribe(false)}
  >
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!hidden}
      disabled={disabled}
      aria-describedby={described ? descriptionId : undefined}
      onFocus={() => onDescribe(true)}
      onBlur={() => onDescribe(false)}
      className={`flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-ui-panel disabled:cursor-not-allowed disabled:hover:bg-transparent ${
        hidden ? "opacity-60" : ""
      } ${small ? "text-[11px]" : "text-xs"}`}
    >
      <Swatch fillClass={fillClass} ringClass={ringClass} hidden={hidden} small={small} />
      <span
        className={`shrink-0 truncate ${small ? "w-[5.5rem]" : "w-24"} ${
          hidden ? "text-ui-text-muted line-through" : "text-ui-text-secondary"
        }`}
      >
        {label}
      </span>
      <span className="ml-auto w-14 shrink-0 text-right text-ui-text tabular-nums">
        {formatTokens(tokens)}
      </span>
      <span className="w-12 shrink-0 text-right text-ui-text-muted tabular-nums">
        {formatPercent(tokens, windowSize)}
      </span>
    </button>
    {described ? (
      <RowDescription
        id={descriptionId}
        label={label}
        description={description}
        disabledReason={disabledReason}
      />
    ) : null}
  </li>
);

/**
 * Lists the Categories of a Context Snapshot with their exact token totals, and
 * toggles each of them.
 */
export const ContextLegend = ({
  snapshot,
  windowSize,
  filters,
  onToggleCategory,
  onToggleMessageKind,
  onColourByKind,
}: ContextLegendProps) => {
  const free = Math.max(0, windowSize - snapshot.measuredTotal);
  // Hiding Messages blanks every Cell its Kinds could have blanked, so the Kind
  // rows below it are already answered and stop taking clicks until it is back.
  const messagesHidden = isCategoryHidden(filters, "messages");

  // One row describes itself at a time: the cards float over their neighbours,
  // so two of them open at once would overlap. Leaving only clears the row that
  // set it, because the pointer enters the next row before it leaves the last.
  const baseId = useId();
  const [describedRow, setDescribedRow] = useState<string | undefined>(undefined);
  const describe = (key: string) => (described: boolean) =>
    setDescribedRow((current) => (described ? key : current === key ? undefined : current));

  return (
    <div>
      <ul className="space-y-0.5">
        {CATEGORY_ORDER.map((category) => (
          <Fragment key={category}>
            <FilterRow
              fillClass={CATEGORY_FILL_CLASS[category]}
              ringClass={CATEGORY_RING_CLASS[category]}
              label={CATEGORY_LABELS[category]}
              description={CATEGORY_DESCRIPTIONS[category]}
              descriptionId={`${baseId}-category-${category}`}
              described={describedRow === `category:${category}`}
              onDescribe={describe(`category:${category}`)}
              tokens={snapshot.byCategory[category]}
              windowSize={windowSize}
              hidden={isCategoryHidden(filters, category)}
              disabled={false}
              disabledReason={undefined}
              small={false}
              onToggle={() => onToggleCategory(category)}
            />
            {/* Messages is the one Category with an inside: its Kinds hang off
                its row with toggles of their own. */}
            {category === "messages" ? (
              <li>
                <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-ui-border pl-2">
                  {MESSAGE_KIND_ORDER.map((kind) => (
                    <FilterRow
                      key={kind}
                      fillClass={MESSAGE_KIND_FILL_CLASS[kind]}
                      ringClass={MESSAGE_KIND_RING_CLASS[kind]}
                      label={MESSAGE_KIND_LABELS[kind]}
                      description={MESSAGE_KIND_DESCRIPTIONS[kind]}
                      descriptionId={`${baseId}-kind-${kind}`}
                      described={describedRow === `kind:${kind}`}
                      onDescribe={describe(`kind:${kind}`)}
                      tokens={snapshot.byKind[kind]}
                      windowSize={windowSize}
                      hidden={isMessageKindHidden(filters, kind)}
                      disabled={messagesHidden}
                      disabledReason={messagesHidden ? MESSAGES_HIDDEN_HINT : undefined}
                      small
                      onToggle={() => onToggleMessageKind(kind)}
                    />
                  ))}
                </ul>
              </li>
            ) : null}
          </Fragment>
        ))}
        {/* Free space is not a Category and has nothing to hide: it is what the
            window has left, which the grid must always show. It describes
            itself like the rows above it, but only on hover — it is a reading
            rather than a control, and giving it a focus stop to carry a
            description would add a tab stop that does nothing. */}
        <li
          className="relative"
          onMouseEnter={() => describe("free")(true)}
          onMouseLeave={() => describe("free")(false)}
        >
          <div className="flex items-baseline gap-2 px-1 py-0.5 text-xs opacity-70">
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] ring-1 ring-ui-border ${FREE_FILL_CLASS}`}
              aria-hidden="true"
            />
            <span className="w-24 shrink-0 truncate text-ui-text-muted">Free space</span>
            <span className="ml-auto w-14 shrink-0 text-right text-ui-text tabular-nums">
              {formatTokens(free)}
            </span>
            <span className="w-12 shrink-0 text-right text-ui-text-muted tabular-nums">
              {formatPercent(free, windowSize)}
            </span>
          </div>
          {describedRow === "free" ? (
            <RowDescription
              id={`${baseId}-free`}
              label="Free space"
              description={FREE_SPACE_DESCRIPTION}
              disabledReason={undefined}
            />
          ) : null}
        </li>
      </ul>

      <label className="mt-2 flex items-center gap-2 px-1 text-[11px] text-ui-text-muted">
        <input
          type="checkbox"
          checked={filters.colourByKind}
          onChange={(event) => onColourByKind(event.target.checked)}
          className="accent-ui-action"
        />
        Colour Messages by kind
      </label>
    </div>
  );
};
