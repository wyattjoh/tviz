/**
 * The two lines above the grid: which Session is loaded, and which API Call the
 * grid is showing.
 */
import type { ContextSnapshot, Session } from "../domain/context.ts";
import { formatPercent, formatTimestamp, formatTokens } from "./format.ts";

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
   * Clears the Session and returns to the drop zone.
   */
  readonly onClear: () => void;
};

/**
 * Session identity, then model, Claude Code version, API Call and fill level.
 */
export const SessionHeader = ({ session, snapshot, onClear }: SessionHeaderProps) => (
  <header>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ui-text-faint">
      <span className="text-ui-text">tviz</span>
      <span className="text-ui-focus underline underline-offset-4">{session.fileName}</span>
      <span className="truncate">{session.id}</span>
      <button type="button" onClick={onClear} className="ml-auto hover:text-ui-text-secondary">
        clear
      </button>
    </div>

    <div className="mt-6 text-ui-text-secondary">
      <span className="text-ui-text-faint">⟩ </span>
      {session.model ?? "unknown model"} · cc {session.claudeCodeVersion ?? "unknown"} · call{" "}
      <span className="text-ui-text">{snapshot.index + 1}</span>/{session.calls.length} ·{" "}
      {formatTimestamp(snapshot.timestamp)}
      {snapshot.reset ? <span className="text-ui-warning"> · compacted</span> : null}
    </div>

    <div className="mt-1 text-ui-text">
      {formatTokens(snapshot.measuredTotal)} / {formatTokens(session.windowSize)} tokens ·{" "}
      <span className="text-ui-text-muted">
        {formatPercent(snapshot.measuredTotal, session.windowSize)} full
        {/* A Subagent Session owns a separate Context Window; only the folder
            loader can count them, so a single dropped file says nothing. */}
        {session.subagentCount === undefined
          ? null
          : ` · ${session.subagentCount} subagent sessions`}
      </span>
    </div>
  </header>
);
