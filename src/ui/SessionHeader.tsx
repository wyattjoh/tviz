/**
 * The Session strip under the menu bar: which Session is loaded, which API Call
 * the grid is showing, how full the Context Window is at that call, and the
 * Context Window override.
 */
import type { ContextSnapshot, Session } from "../domain/context.ts";
import { formatPercent, formatTimestamp, formatTokens } from "./format.ts";
import { type WindowChoice, WINDOW_CHOICES } from "./window-choice.ts";

/**
 * Props for {@link SessionHeader}.
 */
export type SessionHeaderProps = {
  /**
   * The loaded Session.
   */
  readonly session: Session;
  /**
   * The Context Snapshot currently on screen.
   */
  readonly snapshot: ContextSnapshot;
  /**
   * The Context Window used as the fill bar's and the token count's
   * denominator — the Session's inferred `windowSize` unless `windowChoice`
   * overrides it.
   */
  readonly windowSize: number;
  /**
   * Which Context Window override is selected.
   */
  readonly windowChoice: WindowChoice;
  /**
   * Changes the Context Window override.
   */
  readonly onWindowChoiceChange: (choice: WindowChoice) => void;
  /**
   * Closes this Session — and only this one. With several Sessions open the
   * File menu still shows the rest; the drop zone only comes back once none
   * are left. Closing every Session at once is "Close all sessions" in the
   * File menu, a separate, explicit action.
   */
  readonly onClose: () => void;
};

const windowChoiceLabel = (choice: WindowChoice): string =>
  choice === "auto" ? "auto" : formatTokens(choice);

/**
 * Session identity on the left, fill level and the Context Window override on
 * the right, in one strip.
 */
export const SessionHeader = ({
  session,
  snapshot,
  windowSize,
  windowChoice,
  onWindowChoiceChange,
  onClose,
}: SessionHeaderProps) => (
  <section
    aria-label="Session"
    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ui-border bg-ui-sunken px-4 py-2"
  >
    <span className="text-ui-focus underline underline-offset-4">{session.fileName}</span>
    <span className="truncate text-xs text-ui-text-faint">{session.id}</span>
    <span className="rounded bg-ui-panel px-2 py-0.5 text-xs text-ui-text-secondary">
      {session.model ?? "unknown model"}
    </span>
    <span className="text-xs text-ui-text-muted">cc {session.claudeCodeVersion ?? "unknown"}</span>
    <span className="text-xs text-ui-text-muted">
      call <span className="text-ui-text">{snapshot.index + 1}</span>/{session.calls.length} ·{" "}
      {formatTimestamp(snapshot.timestamp)}
    </span>
    {/* A Subagent Session owns a separate Context Window; only the folder
        loader can count them, so a single dropped file says nothing. */}
    {session.subagentCount === undefined ? null : (
      <span className="text-xs text-ui-text-faint">{session.subagentCount} subagent sessions</span>
    )}
    {/* A compaction is the one API Call that rewrites the grid instead of
        extending it, so it is named rather than left to the Scrubber's mark. */}
    {snapshot.reset ? <span className="text-xs text-ui-warning"> · compaction</span> : null}

    <div className="ml-auto flex items-center gap-3">
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-ui-panel">
        <div
          className="h-full rounded-full bg-ui-action"
          style={{
            width: `${Math.min(100, (snapshot.measuredTotal / Math.max(1, windowSize)) * 100)}%`,
          }}
        />
      </div>
      <span className="text-xs text-ui-text">
        {formatTokens(snapshot.measuredTotal)} / {formatTokens(windowSize)} tokens ·{" "}
        <span className="text-ui-text-muted">
          {formatPercent(snapshot.measuredTotal, windowSize)} full
        </span>
      </span>
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
            className={`px-2 py-0.5 ${
              choice === windowChoice
                ? "bg-ui-panel-active text-ui-text"
                : "text-ui-text-muted hover:bg-ui-panel"
            }`}
          >
            {windowChoiceLabel(choice)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Close this Session"
        className="rounded px-2 py-0.5 text-xs text-ui-text-muted hover:bg-ui-panel hover:text-ui-text"
      >
        close
      </button>
    </div>
  </section>
);
