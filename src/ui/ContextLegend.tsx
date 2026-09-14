/**
 * Legend and filters for the grid: tokens and percent of the Context Window per
 * Category, with Messages expanded into its separately coloured Message Kinds,
 * ending with the free-space line `/context` shows.
 *
 * Every row is also its own filter. Toggling one blanks that Category's or that
 * Message Kind's Cells in place — it never re-flows the grid and it never
 * changes a total on this legend, because the numbers come from the Context
 * Snapshot rather than from the Cells (ADR-0006). What is hidden is still
 * counted, so the percentages two Sessions are compared on stay stable.
 *
 * Every row also says what it counts, in a card that floats under it while it
 * is hovered with a hover-capable pointer or receives keyboard-visible focus.
 * Touch taps only toggle the row: they must not leave a description floating
 * over the larger phone controls. The copy lives with the vocabulary in
 * `src/domain/context.ts`, not here, so the words the legend uses for a
 * Category are the words the domain uses for it.
 */
import { ListChecks, ListX } from "lucide-react";
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
import {
  areAllFiltersHidden,
  type GridFilters,
  isCategoryHidden,
  isMessageKindHidden,
} from "./filters.ts";
import { formatPercent, formatTokens } from "./format.ts";
import {
  CATEGORY_FILL_CLASS,
  CATEGORY_RING_CLASS,
  FREE_FILL_CLASS,
  MESSAGE_KIND_FILL_CLASS,
  MESSAGE_KIND_RING_CLASS,
  messageKindSwatchBackground,
} from "./theme.ts";

/**
 * Why the Message Kind rows stop taking clicks: their Category decides for them.
 */
const MESSAGES_HIDDEN_HINT = "Messages is hidden, which blanks every Kind; show Messages to filter";

/**
 * Props for {@link FilterAllButton}.
 */
type FilterAllButtonProps = {
  /**
   * The current filter state, which determines the button's next action.
   */
  readonly filters: GridFilters;
  /**
   * Selects or deselects every Category and Message Kind.
   */
  readonly onToggle: () => void;
};

/**
 * The Categories panel's bulk visibility control.
 */
export const FilterAllButton = ({ filters, onToggle }: FilterAllButtonProps) => {
  const selecting = areAllFiltersHidden(filters);
  const label = selecting ? "Select all filters" : "Deselect all filters";
  const Icon = selecting ? ListChecks : ListX;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded p-0 text-ui-text-faint hover:bg-ui-panel hover:text-ui-text md:-my-1 md:min-h-0 md:min-w-0 md:p-1"
    >
      <Icon
        aria-hidden="true"
        data-icon={selecting ? "select-all" : "deselect-all"}
        className="h-5 w-5 md:h-3.5 md:w-3.5"
      />
    </button>
  );
};

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
   * Which rows are toggled off.
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
};

/**
 * The swatch of a filter row: filled when shown, an outline when hidden.
 */
type SwatchProps = {
  readonly fillClass: string | undefined;
  readonly fillBackground: string | undefined;
  readonly ringClass: string;
  readonly hidden: boolean;
  readonly small: boolean;
};

const swatchSizeClass = (small: boolean): string =>
  small ? "h-4 w-4 md:h-2 md:w-2" : "h-4 w-4 md:h-2.5 md:w-2.5";

const Swatch = ({ fillClass, fillBackground, ringClass, hidden, small }: SwatchProps) => (
  <span
    className={`inline-block shrink-0 rounded-[2px] ${swatchSizeClass(small)} ${
      hidden ? `ring-1 ring-inset ${ringClass}` : (fillClass ?? "")
    }`}
    style={hidden || fillBackground === undefined ? undefined : { background: fillBackground }}
    aria-hidden="true"
  />
);

/**
 * What a row counts, revealed on hover-capable pointers or keyboard focus.
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
  readonly fillClass: string | undefined;
  readonly fillBackground: string | undefined;
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
  fillBackground,
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
  // Pointer handlers ride on the `li` rather than the button because a disabled
  // button fires no pointer events of its own, and a Message Kind row whose
  // Category is hidden still has something to say about what it counts. Touch
  // is excluded explicitly: a tap is the toggle gesture, not synthetic hover.
  <li
    className="relative"
    onPointerEnter={(event) => {
      if (event.pointerType !== "touch") onDescribe(true);
    }}
    onPointerLeave={() => onDescribe(false)}
  >
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!hidden}
      disabled={disabled}
      aria-describedby={described ? descriptionId : undefined}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) onDescribe(true);
      }}
      onBlur={() => onDescribe(false)}
      className={`flex min-h-11 w-full touch-manipulation cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-ui-panel active:bg-ui-panel disabled:cursor-not-allowed disabled:hover:bg-transparent md:min-h-0 md:items-baseline md:px-1 md:py-0.5 ${
        hidden ? "opacity-60" : ""
      } ${small ? "text-sm md:text-[11px]" : "text-base md:text-xs"}`}
    >
      <Swatch
        fillClass={fillClass}
        fillBackground={fillBackground}
        ringClass={ringClass}
        hidden={hidden}
        small={small}
      />
      <span
        className={`min-w-0 flex-1 leading-tight ${
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
}: ContextLegendProps) => {
  const free = Math.max(0, windowSize - snapshot.measuredTotal);
  const enabledMessageKinds = MESSAGE_KIND_ORDER.filter(
    (kind) => !isMessageKindHidden(filters, kind),
  );
  const messagesSwatchBackground = messageKindSwatchBackground(enabledMessageKinds);
  // Explicitly hiding Messages blanks every Kind, so its rows stop taking
  // clicks until the parent bulk control selects them all again.
  const messagesCategoryHidden = filters.hiddenCategories.has("messages");

  // One row describes itself at a time: the cards float over their neighbours,
  // so two of them open at once would overlap. Leaving only clears the row that
  // set it, because the pointer enters the next row before it leaves the last.
  const baseId = useId();
  const [describedRow, setDescribedRow] = useState<string | undefined>(undefined);
  const describe = (key: string) => (described: boolean) =>
    setDescribedRow((current) => (described ? key : current === key ? undefined : current));

  return (
    <div>
      <ul className="space-y-1 md:space-y-0.5">
        {CATEGORY_ORDER.map((category) => (
          <Fragment key={category}>
            <FilterRow
              fillClass={category === "messages" ? undefined : CATEGORY_FILL_CLASS[category]}
              fillBackground={category === "messages" ? messagesSwatchBackground : undefined}
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
            {/* Messages is the one Category with an inside: its Kinds always
                hang off its row with toggles of their own. */}
            {category === "messages" ? (
              <li>
                <ul className="mt-1 ml-3 space-y-1 border-l border-ui-border pl-2 md:mt-0.5 md:space-y-0.5">
                  {MESSAGE_KIND_ORDER.map((kind) => (
                    <FilterRow
                      key={kind}
                      fillClass={MESSAGE_KIND_FILL_CLASS[kind]}
                      fillBackground={undefined}
                      ringClass={MESSAGE_KIND_RING_CLASS[kind]}
                      label={MESSAGE_KIND_LABELS[kind]}
                      description={MESSAGE_KIND_DESCRIPTIONS[kind]}
                      descriptionId={`${baseId}-kind-${kind}`}
                      described={describedRow === `kind:${kind}`}
                      onDescribe={describe(`kind:${kind}`)}
                      tokens={snapshot.byKind[kind]}
                      windowSize={windowSize}
                      hidden={isMessageKindHidden(filters, kind)}
                      disabled={messagesCategoryHidden}
                      disabledReason={messagesCategoryHidden ? MESSAGES_HIDDEN_HINT : undefined}
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
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") describe("free")(true);
          }}
          onPointerLeave={() => describe("free")(false)}
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
    </div>
  );
};
