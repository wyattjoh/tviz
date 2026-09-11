/**
 * The Session strip under the menu bar: which Session is loaded and which API
 * Call the grid is showing.
 *
 * How full the Context Window is, and the override that sets the window, are in
 * the rail's Context Window panel rather than here — the strip is identity plus
 * one action, so a narrow window wraps it less.
 */
import type { ContextSnapshot, Session } from "../domain/context.ts";
import { formatTimestamp } from "./format.ts";

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
   * Closes this Session — and only this one. With several Sessions open the
   * File menu still shows the rest; the drop zone only comes back once none
   * are left. Closing every Session at once is "Close all sessions" in the
   * File menu, a separate, explicit action.
   */
  readonly onClose: () => void;
};

/**
 * Session identity on the left, closing the Session on the right, in one strip.
 */
export const SessionHeader = ({ session, snapshot, onClose }: SessionHeaderProps) => (
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

    <button
      type="button"
      onClick={onClose}
      title="Close this Session"
      className="ml-auto rounded px-2 py-0.5 text-xs text-ui-text-muted hover:bg-ui-panel hover:text-ui-text"
    >
      close
    </button>
  </section>
);
