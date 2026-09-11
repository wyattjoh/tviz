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
 *
 * The panel is the reading; {@link ContextWindowMenu} is the setting, and rides
 * in the panel's header row rather than in its body.
 */
import { Check, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
   * Which Context Window override is selected. The panel only reports it, in
   * the "(inferred)"/"(override)" note; changing it is
   * {@link ContextWindowMenu}.
   */
  readonly windowChoice: WindowChoice;
};

const windowChoiceLabel = (choice: WindowChoice): string =>
  choice === "auto" ? "auto" : formatTokens(choice);

/**
 * Draws the fill meter, the token count, and which window they are measured
 * against.
 */
export const ContextWindowPanel = ({
  measuredTotal,
  windowSize,
  peak,
  windowChoice,
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
    {/* With the override behind the cog, this line is what says which window is
        in force and whether anyone picked it — so it stays in the body, always
        visible, rather than moving into the menu with the control. */}
    <p className="text-[11px] leading-snug text-ui-text-faint">
      window {formatTokens(windowSize)} {windowChoice === "auto" ? "(inferred)" : "(override)"} ·
      peak {formatTokens(peak)}
    </p>
  </div>
);

/**
 * Props for {@link ContextWindowMenu}.
 */
export type ContextWindowMenuProps = {
  /**
   * Which Context Window override is selected.
   */
  readonly windowChoice: WindowChoice;
  /**
   * Changes the Context Window override.
   */
  readonly onWindowChoiceChange: (choice: WindowChoice) => void;
};

/**
 * The cog in the panel's header row, opening the Context Window override.
 *
 * The override is a setting rather than a reading: it is picked once for a
 * Session, if at all, and then left alone — so it sits behind a cog instead of
 * spending a row of the rail on three buttons that are almost never pressed.
 * Nothing is hidden by that: the panel's "(inferred)"/"(override)" note names
 * the window in force without the menu being opened.
 *
 * Opens on click and closes on Escape or a click outside, the same way the File
 * menu does.
 */
export const ContextWindowMenu = ({
  windowChoice,
  onWindowChoiceChange,
}: ContextWindowMenuProps) => {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Context Window override"
        title="Context Window override"
        className={`-my-1 rounded p-1 ${
          open
            ? "bg-ui-panel-active text-ui-text"
            : "text-ui-text-faint hover:bg-ui-panel hover:text-ui-text"
        }`}
      >
        <Settings aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {!open ? null : (
        <div
          role="group"
          aria-label="Context Window"
          className="absolute top-full right-0 z-40 mt-1 w-36 overflow-hidden rounded-md border border-ui-border bg-ui-sunken py-1 shadow-lg"
        >
          {WINDOW_CHOICES.map((choice) => (
            <button
              type="button"
              key={String(choice)}
              aria-pressed={choice === windowChoice}
              onClick={() => {
                onWindowChoiceChange(choice);
                setOpen(false);
              }}
              className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-xs text-ui-text-secondary hover:bg-ui-panel-hover hover:text-ui-text"
            >
              <span className="w-3 shrink-0 self-center text-ui-focus" aria-hidden="true">
                {choice === windowChoice ? <Check className="h-3 w-3" /> : null}
              </span>
              {windowChoiceLabel(choice)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
