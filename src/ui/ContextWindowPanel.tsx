/**
 * The Context Window panel in the right rail, under the Categories legend: how
 * full the window is at the selected API Call, and the override that decides
 * which window the whole view is measured against.
 *
 * This lived on the right of the Session strip until the strip ran out of room
 * — on a narrow window the Session's identity and these controls wrapped onto
 * two lines and the grid lost the height. The rail is where the same question
 * is already being answered: the legend's Free space line and this meter are
 * the same number seen twice, so they belong next to each other.
 */
import { formatPercent, formatTokens } from "./format.ts";
import { type WindowChoice, WINDOW_CHOICES } from "./window-choice.ts";

/**
 * Props for {@link ContextWindowPanel}.
 */
export type ContextWindowPanelProps = {
  /**
   * Measured Tokens of the API Call on screen — the filled part of the meter.
   */
  readonly measuredTotal: number;
  /**
   * The Context Window everything is measured against: the Session's inferred
   * `windowSize` unless `windowChoice` overrides it.
   */
  readonly windowSize: number;
  /**
   * The largest Measured Tokens any API Call of the Session reached, so the
   * high-water mark is legible from a call that sits below it.
   */
  readonly peak: number;
  /**
   * Which Context Window override is selected.
   */
  readonly windowChoice: WindowChoice;
  /**
   * Changes the Context Window override.
   */
  readonly onWindowChoiceChange: (choice: WindowChoice) => void;
};

const windowChoiceLabel = (choice: WindowChoice): string =>
  choice === "auto" ? "auto" : formatTokens(choice);

/**
 * Draws the fill meter, the token count and the Context Window override.
 */
export const ContextWindowPanel = ({
  measuredTotal,
  windowSize,
  peak,
  windowChoice,
  onWindowChoiceChange,
}: ContextWindowPanelProps) => (
  <div className="space-y-2">
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ui-panel">
      <div
        className="h-full rounded-full bg-ui-action"
        style={{ width: `${Math.min(100, (measuredTotal / Math.max(1, windowSize)) * 100)}%` }}
      />
    </div>
    <p className="text-xs text-ui-text">
      {formatTokens(measuredTotal)} / {formatTokens(windowSize)} tokens ·{" "}
      <span className="text-ui-text-muted">{formatPercent(measuredTotal, windowSize)} full</span>
    </p>
    {/* The buttons share the rail's width rather than sitting at their label
        widths, so the group reads as one control at any rail size. */}
    <div
      role="group"
      aria-label="Context Window"
      className="flex overflow-hidden rounded border border-ui-border text-xs"
    >
      {WINDOW_CHOICES.map((choice) => (
        <button
          type="button"
          key={String(choice)}
          aria-pressed={choice === windowChoice}
          onClick={() => onWindowChoiceChange(choice)}
          className={`flex-1 px-2 py-0.5 ${
            choice === windowChoice
              ? "bg-ui-panel-active text-ui-text"
              : "text-ui-text-muted hover:bg-ui-panel"
          }`}
        >
          {windowChoiceLabel(choice)}
        </button>
      ))}
    </div>
    {/* Whether the denominator was inferred or picked belongs beside the
        control that picks it, not in the Transcript panel's parse stats. */}
    <p className="text-[11px] leading-snug text-ui-text-faint">
      window {formatTokens(windowSize)} {windowChoice === "auto" ? "(inferred)" : "(override)"} ·
      peak {formatTokens(peak)}
    </p>
  </div>
);
