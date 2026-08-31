/**
 * Legend for the grid: tokens and percent of the Context Window per Category,
 * laid out as an aligned text table under the grid, ending with the free-space
 * line `/context` shows.
 */
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ContextSnapshot,
  SYSTEM_CATEGORY_HINT,
} from "../domain/context.ts";
import { formatPercent, formatTokens } from "./format.ts";
import { CATEGORY_FILL_CLASS, FREE_FILL_CLASS } from "./theme.ts";

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
};

type LegendRowProps = {
  readonly swatchClass: string;
  readonly label: string;
  readonly hint: string | undefined;
  readonly tokens: number;
  readonly windowSize: number;
  readonly dim: boolean;
};

const LegendRow = ({ swatchClass, label, hint, tokens, windowSize, dim }: LegendRowProps) => (
  // Laid out for the 340px rail: the hint sits under its row rather than
  // beside it, so the numbers stay in their columns.
  <li className={`px-1 py-0.5 ${dim ? "opacity-70" : ""}`}>
    <div className="flex items-baseline gap-2 text-xs">
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 translate-y-px rounded-[2px] ${swatchClass}`}
        aria-hidden="true"
      />
      <span
        className={`w-24 shrink-0 truncate ${dim ? "text-ui-text-muted" : "text-ui-text-secondary"}`}
      >
        {label}
      </span>
      <span className="ml-auto w-14 shrink-0 text-right text-ui-text tabular-nums">
        {formatTokens(tokens)}
      </span>
      <span className="w-12 shrink-0 text-right text-ui-text-muted tabular-nums">
        {formatPercent(tokens, windowSize)}
      </span>
    </div>
    {hint === undefined ? null : (
      <p className="mt-0.5 ml-[18px] text-[10px] leading-snug text-ui-text-faint">{hint}</p>
    )}
  </li>
);

/**
 * Lists the Categories of a Context Snapshot with their exact token totals.
 */
export const ContextLegend = ({ snapshot, windowSize }: ContextLegendProps) => {
  const free = Math.max(0, windowSize - snapshot.measuredTotal);

  return (
    <ul className="space-y-0.5">
      {CATEGORY_ORDER.map((category) => (
        <LegendRow
          key={category}
          swatchClass={CATEGORY_FILL_CLASS[category]}
          label={CATEGORY_LABELS[category]}
          hint={category === "system" ? SYSTEM_CATEGORY_HINT : undefined}
          tokens={snapshot.byCategory[category]}
          windowSize={windowSize}
          dim={false}
        />
      ))}
      <LegendRow
        swatchClass={`${FREE_FILL_CLASS} ring-1 ring-ui-border`}
        label="Free space"
        hint={undefined}
        tokens={free}
        windowSize={windowSize}
        dim
      />
    </ul>
  );
};
