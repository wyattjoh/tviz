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
  <li className={`flex items-baseline gap-3 px-1 py-0.5 ${dim ? "opacity-70" : ""}`}>
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 translate-y-px rounded-[2px] ${swatchClass}`}
      aria-hidden="true"
    />
    <span className={`w-36 shrink-0 ${dim ? "text-ui-text-muted" : "text-ui-text-secondary"}`}>
      {label}
    </span>
    <span className="w-16 shrink-0 text-right text-ui-text tabular-nums">
      {formatTokens(tokens)}
    </span>
    <span className="w-16 shrink-0 text-right text-ui-text-muted tabular-nums">
      {formatPercent(tokens, windowSize)}
    </span>
    {hint === undefined ? null : (
      <span className="hidden text-[11px] text-ui-text-faint md:inline">{hint}</span>
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
